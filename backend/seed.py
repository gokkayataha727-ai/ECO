import random
from datetime import datetime, timedelta, timezone
from database import SessionLocal, engine, Base
import models

def seed_data():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # Check if we already have data
    if db.query(models.Product).first():
        print("Data already seeded.")
        return

    print("Seeding products...")
    products_data = [
        {"name": "Espresso", "category": "Kahve", "price": 45.0},
        {"name": "Americano", "category": "Kahve", "price": 55.0},
        {"name": "Latte", "category": "Kahve", "price": 65.0},
        {"name": "Cappuccino", "category": "Kahve", "price": 65.0},
        {"name": "Filtre Kahve", "category": "Kahve", "price": 50.0},
        {"name": "Çay", "category": "Sıcak İçecek", "price": 25.0},
        {"name": "Su", "category": "Soğuk İçecek", "price": 15.0},
        {"name": "Cheesecake", "category": "Tatlı", "price": 95.0},
        {"name": "Brownie", "category": "Tatlı", "price": 85.0},
        {"name": "Tiramisu", "category": "Tatlı", "price": 110.0}
    ]

    products = []
    for pd in products_data:
        p = models.Product(**pd)
        db.add(p)
        products.append(p)
    
    db.commit()

    print("Seeding orders for the last 35 days...")
    now = datetime.now(timezone.utc)
    
    # Generate around 10-30 orders per day for the last 35 days
    cashiers = ["Ahmet Yılmaz", "ECO", "Mehmet Kaya"]
    payment_types = ["Nakit", "Kart", "Kart", "Kart"] # 75% card

    for day_offset in range(35):
        current_date = now - timedelta(days=day_offset)
        num_orders = random.randint(15, 45)
        
        for _ in range(num_orders):
            # random hour between 8 AM and 10 PM
            order_time = current_date.replace(hour=random.randint(8, 21), minute=random.randint(0, 59))
            
            order = models.Order(
                created_at=order_time,
                payment_type=random.choice(payment_types),
                cashier=random.choice(cashiers),
                status="Tamamlandı"
            )
            db.add(order)
            db.commit() # commit to get order ID
            
            # 1 to 4 items per order
            num_items = random.randint(1, 4)
            order_total = 0
            
            for _ in range(num_items):
                p = random.choice(products)
                qty = random.randint(1, 3)
                line_total = qty * p.price
                order_total += line_total
                
                item = models.OrderItem(
                    order_id=order.id,
                    product_id=p.id,
                    quantity=qty,
                    unit_price=p.price,
                    line_total=line_total
                )
                db.add(item)
            
            order.total_amount = order_total
            db.commit()

    print("Seeding completed successfully!")

if __name__ == "__main__":
    seed_data()
