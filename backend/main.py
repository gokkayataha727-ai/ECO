import os
import uuid
import shutil
import json
from fastapi import FastAPI, Depends, Query, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, extract
from datetime import datetime, timedelta, timezone
from typing import List
import math

from database import get_db, engine, Base
import models
import schemas

Base.metadata.create_all(bind=engine)

app = FastAPI(title="ECO Coffee API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOADS_DIR = "uploads"
os.makedirs(UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

@app.post("/api/upload-logo")
def upload_logo(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename)[1] if file.filename else ".png"
    public_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "public"))
    os.makedirs(public_dir, exist_ok=True)
    target_path = os.path.join(public_dir, f"logo{ext}")
    with open(target_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"status": "ok", "url": f"/logo{ext}"}

@app.get("/api/products", response_model=List[schemas.Product])
def get_products(db: Session = Depends(get_db)):
    products = db.query(models.Product).all()
    res = []
    for p in products:
        p_dict = {
            "id": p.id,
            "name": p.name,
            "category": p.category,
            "price": p.price,
            "image_url": p.image_url,
            "description": p.description or "",
            "badge": p.badge,
            "option_groups": p.option_groups,
            "optionGroups": json.loads(p.option_groups) if p.option_groups else None,
        }
        res.append(p_dict)
    return res

@app.post("/api/products", response_model=schemas.Product)
def create_product(
    id: str = Form(None),
    name: str = Form(...),
    category: str = Form(...),
    price: float = Form(...),
    description: str = Form(None),
    badge: str = Form(None),
    option_groups: str = Form(None),
    image: UploadFile = File(None),
    db: Session = Depends(get_db)
):
    image_url = None
    if image:
        ext = os.path.splitext(image.filename)[1] if image.filename else ""
        filename = f"{uuid.uuid4().hex}{ext}"
        filepath = os.path.join(UPLOADS_DIR, filename)
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(image.file, buffer)
        image_url = f"/uploads/{filename}"

    db_product = None
    if id:
        db_product = db.query(models.Product).filter(models.Product.id == id).first()
    if not db_product:
        db_product = db.query(models.Product).filter(models.Product.name == name).first()

    if db_product:
        db_product.name = name
        db_product.category = category
        db_product.price = price
        if description is not None:
            db_product.description = description
        if badge is not None:
            db_product.badge = badge
        if option_groups is not None:
            db_product.option_groups = option_groups
        if image_url is not None:
            db_product.image_url = image_url
    else:
        prod_id = id if id else str(uuid.uuid4())
        db_product = models.Product(
            id=prod_id,
            name=name,
            category=category,
            price=price,
            description=description or "",
            badge=badge,
            option_groups=option_groups,
            image_url=image_url
        )
        db.add(db_product)

    db.commit()
    db.refresh(db_product)
    
    return {
        "id": db_product.id,
        "name": db_product.name,
        "category": db_product.category,
        "price": db_product.price,
        "image_url": db_product.image_url,
        "description": db_product.description or "",
        "badge": db_product.badge,
        "option_groups": db_product.option_groups,
        "optionGroups": json.loads(db_product.option_groups) if db_product.option_groups else None,
    }

@app.delete("/api/products/{product_id}")
def delete_product(product_id: str, db: Session = Depends(get_db)):
    db_product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if db_product:
        db.delete(db_product)
        db.commit()
    return {"status": "ok", "deleted": product_id}

@app.get("/api/reports/summary", response_model=schemas.SummaryReport)
def get_summary(days: int = 30, db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    start_date = now - timedelta(days=days)
    prev_start_date = start_date - timedelta(days=days)

    # Current period
    current_orders = db.query(models.Order).filter(models.Order.created_at >= start_date).all()
    current_revenue = sum(o.total_amount for o in current_orders)
    current_count = len(current_orders)
    current_avg = current_revenue / current_count if current_count > 0 else 0

    # Previous period
    prev_orders = db.query(models.Order).filter(
        models.Order.created_at >= prev_start_date,
        models.Order.created_at < start_date
    ).all()
    prev_revenue = sum(o.total_amount for o in prev_orders)
    prev_count = len(prev_orders)
    prev_avg = prev_revenue / prev_count if prev_count > 0 else 0

    def calc_growth(curr, prev):
        if prev == 0:
            return 100.0 if curr > 0 else 0.0
        return ((curr - prev) / prev) * 100.0

    return {
        "total_revenue": current_revenue,
        "total_orders": current_count,
        "avg_basket": current_avg,
        "revenue_growth": calc_growth(current_revenue, prev_revenue),
        "orders_growth": calc_growth(current_count, prev_count),
        "avg_basket_growth": calc_growth(current_avg, prev_avg),
    }

@app.get("/api/reports/sales-trend")
def get_sales_trend(days: int = 30, db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    start_date = now - timedelta(days=days)
    
    orders = db.query(models.Order).filter(models.Order.created_at >= start_date).all()
    
    daily_data = {}
    for i in range(days):
        d = (start_date + timedelta(days=i)).strftime("%Y-%m-%d")
        daily_data[d] = {"date": d, "revenue": 0, "orders": 0}
        
    for o in orders:
        d = o.created_at.strftime("%Y-%m-%d")
        if d in daily_data:
            daily_data[d]["revenue"] += o.total_amount
            daily_data[d]["orders"] += 1
            
    trend_list = sorted(list(daily_data.values()), key=lambda x: x["date"])
    
    # Also get payment distribution
    payment_dist = {}
    for o in orders:
        pt = o.payment_type or "Nakit"
        payment_dist[pt] = payment_dist.get(pt, 0) + o.total_amount
        
    payment_list = [{"name": k, "value": v} for k, v in payment_dist.items()]
    
    return {
        "trend": trend_list,
        "payment_distribution": payment_list
    }

@app.get("/api/reports/top-products", response_model=List[schemas.TopProductItem])
def get_top_products(days: int = 30, db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    start_date = now - timedelta(days=days)
    
    results = db.query(
        models.Product.id,
        models.Product.name,
        models.Product.category,
        func.sum(models.OrderItem.quantity).label("total_qty"),
        func.sum(models.OrderItem.line_total).label("total_rev")
    ).join(models.OrderItem).join(models.Order).filter(
        models.Order.created_at >= start_date
    ).group_by(
        models.Product.id
    ).order_by(desc("total_rev")).limit(10).all()
    
    return [
        {
            "id": r.id,
            "name": r.name,
            "category": r.category,
            "quantity": r.total_qty or 0,
            "revenue": r.total_rev or 0.0
        }
        for r in results
    ]

@app.get("/api/reports/receipts", response_model=schemas.PaginatedReceipts)
def get_receipts(days: int = 30, page: int = 1, page_size: int = 20, db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    start_date = now - timedelta(days=days)
    
    query = db.query(models.Order).filter(models.Order.created_at >= start_date).order_by(desc(models.Order.created_at))
    
    total = query.count()
    total_pages = math.ceil(total / page_size) if page_size > 0 else 0
    
    orders = query.offset((page - 1) * page_size).limit(page_size).all()
    
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": orders
    }

if __name__ == "__main__":
    import uvicorn
    import sys

    # Production mode: serve built frontend + API
    is_production = "--production" in sys.argv or "--prod" in sys.argv
    
    if is_production:
        # Serve the built frontend from ../dist/
        DIST_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dist"))
        if os.path.exists(DIST_DIR):
            # Serve static assets (JS, CSS, images)
            app.mount("/assets", StaticFiles(directory=os.path.join(DIST_DIR, "assets")), name="frontend-assets")
            
            # Serve other static files in dist root (favicon, etc.)
            from fastapi.responses import FileResponse, HTMLResponse
            
            @app.get("/customer-display.html")
            def customer_display_page():
                file_path = os.path.join(DIST_DIR, "customer-display.html")
                if os.path.exists(file_path):
                    return FileResponse(file_path, media_type="text/html")
                return HTMLResponse("<html><body><h1>Müşteri Ekranı</h1></body></html>")
            
            @app.get("/{full_path:path}")
            def serve_frontend(full_path: str):
                # Try to serve the exact file first
                file_path = os.path.join(DIST_DIR, full_path)
                if full_path and os.path.isfile(file_path):
                    return FileResponse(file_path)
                # Fallback to index.html for SPA routing
                index_path = os.path.join(DIST_DIR, "index.html")
                return FileResponse(index_path, media_type="text/html")
            
            print(f"🟢 Production mode: Serving frontend from {DIST_DIR}")
        else:
            print(f"⚠️  dist/ folder not found at {DIST_DIR}")
            print(f"   Run 'npm run build' first, then restart with --production")
    
    host = "0.0.0.0" if is_production else "127.0.0.1"
    reload_enabled = not is_production
    
    print(f"☕ ECO COFFEE POS Server")
    print(f"   Mode: {'PRODUCTION' if is_production else 'DEVELOPMENT'}")
    print(f"   URL: http://localhost:8000")
    print(f"   Database: {os.path.abspath('eco_coffee.db')}")
    
    uvicorn.run("main:app", host=host, port=8000, reload=reload_enabled)

