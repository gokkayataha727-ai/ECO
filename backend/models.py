from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Float, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import uuid

from database import Base

class Product(Base):
    __tablename__ = "products"

    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, index=True)
    category = Column(String, index=True)
    price = Column(Float)
    image_url = Column(String, nullable=True)
    description = Column(String, nullable=True)
    badge = Column(String, nullable=True)
    option_groups = Column(String, nullable=True)

    # Relationships
    order_items = relationship("OrderItem", back_populates="product")

class Order(Base):
    __tablename__ = "orders"

    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    total_amount = Column(Float, default=0.0)
    discount_amount = Column(Float, default=0.0)
    payment_type = Column(String) # "Nakit" or "Kart"
    cashier = Column(String)
    status = Column(String, default="Tamamlandı") # "Tamamlandı" or "İptal"

    # Relationships
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")

class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    order_id = Column(String, ForeignKey("orders.id"))
    product_id = Column(String, ForeignKey("products.id"))
    quantity = Column(Integer, default=1)
    unit_price = Column(Float)
    line_total = Column(Float)

    # Relationships
    order = relationship("Order", back_populates="items")
    product = relationship("Product", back_populates="order_items")
