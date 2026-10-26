import os
import sys
import json

# Ensure backend dir is in python path
sys.path.append(os.path.dirname(__file__))

from database import engine, Base, SessionLocal
import models
import generate_menu

def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # Clear existing products
    db.query(models.Product).delete()
    db.commit()

    for p in generate_menu.products_data:
        opt_groups_str = json.dumps(p["option_groups"]) if "option_groups" in p else None
        db_product = models.Product(
            id=p["id"],
            name=p["name"],
            category=p["category"],
            price=p["price"],
            description=p.get("description"),
            badge=p.get("badge"),
            option_groups=opt_groups_str
        )
        db.add(db_product)
    
    db.commit()
    count = db.query(models.Product).count()
    db.close()
    print(f"Successfully seeded {count} products into backend SQLite database!")

if __name__ == '__main__':
    seed()
