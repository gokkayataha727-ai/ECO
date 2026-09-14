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

    print("Products check complete.")

if __name__ == "__main__":
    seed_data()

