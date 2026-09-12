from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime

class ProductBase(BaseModel):
    name: str
    category: str
    price: float
    image_url: Optional[str] = None
    description: Optional[str] = None
    badge: Optional[str] = None
    option_groups: Optional[str] = None
    optionGroups: Optional[List[dict]] = None

class Product(ProductBase):
    id: str
    model_config = ConfigDict(from_attributes=True)

class OrderItemBase(BaseModel):
    product_id: str
    quantity: int
    unit_price: float
    line_total: float

class OrderItem(OrderItemBase):
    id: str
    order_id: str
    product: Product
    model_config = ConfigDict(from_attributes=True)

class OrderBase(BaseModel):
    total_amount: float
    discount_amount: float
    payment_type: str
    cashier: str
    status: str

class Order(OrderBase):
    id: str
    created_at: datetime
    items: List[OrderItem] = []
    model_config = ConfigDict(from_attributes=True)

class SummaryReport(BaseModel):
    total_revenue: float
    total_orders: int
    avg_basket: float
    revenue_growth: float
    orders_growth: float
    avg_basket_growth: float

class DailyTrendItem(BaseModel):
    date: str
    revenue: float
    orders: int

class PaymentDistributionItem(BaseModel):
    name: str # Nakit, Kart
    value: float

class TopProductItem(BaseModel):
    id: str
    name: str
    category: str
    quantity: int
    revenue: float

class PaginatedReceipts(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[Order]
