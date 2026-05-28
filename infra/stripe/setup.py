"""Idempotent Stripe setup — creates meter, product, and price if they don't exist.

Usage:
    STRIPE_SECRET_KEY=sk_test_xxx python infra/stripe/setup.py

Safe to run repeatedly — checks for existing resources by metadata lookup_key
before creating.
"""

import os
import sys
from decimal import Decimal

import stripe

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
if not stripe.api_key:
    sys.exit("Error: set STRIPE_SECRET_KEY")

METER_EVENT_NAME = "conversion_bytes"
PRODUCT_LOOKUP_KEY = "canonizr_api"
PRICE_LOOKUP_KEY = "canonizr_per_100kb"
PRICE_PER_UNIT = 0.003  # $0.003 per 100KB
FREE_UNITS = 500  # 500 × 100KB = 50MB free/month


def ensure_meter() -> stripe.billing.Meter:
    """Create the conversion_bytes meter if it doesn't exist."""
    meters = stripe.billing.Meter.list()
    for m in meters.data:
        if m.event_name == METER_EVENT_NAME:
            print(f"Meter '{METER_EVENT_NAME}' already exists: {m.id}")
            return m

    meter = stripe.billing.Meter.create(
        display_name="Conversion bytes (100KB units)",
        event_name=METER_EVENT_NAME,
        default_aggregation={"formula": "sum"},
        value_settings={"event_payload_key": "value"},
    )
    print(f"Created meter: {meter.id}")
    return meter


def ensure_product() -> stripe.Product:
    """Create the Canonizr API product if it doesn't exist."""
    products = stripe.Product.search(query=f"metadata['lookup_key']:'{PRODUCT_LOOKUP_KEY}'")
    if products.data:
        print(f"Product '{PRODUCT_LOOKUP_KEY}' already exists: {products.data[0].id}")
        return products.data[0]

    product = stripe.Product.create(
        name="Canonizr API",
        description="Document-to-markdown conversion API with image captioning",
        metadata={"lookup_key": PRODUCT_LOOKUP_KEY},
    )
    print(f"Created product: {product.id}")
    return product


def ensure_price(product: stripe.Product, meter: stripe.billing.Meter) -> stripe.Price:
    """Create the usage-based price if it doesn't exist."""
    prices = stripe.Price.list(product=product.id, active=True)
    for p in prices.data:
        if p.lookup_key == PRICE_LOOKUP_KEY:
            print(f"Price '{PRICE_LOOKUP_KEY}' already exists: {p.id}")
            return p

    price = stripe.Price.create(
        product=product.id,
        currency="usd",
        billing_scheme="per_unit",
        unit_amount_decimal=Decimal(str(PRICE_PER_UNIT * 100)),  # Stripe uses cents
        recurring={
            "interval": "month",
            "usage_type": "metered",
            "meter": meter.id,
        },
        lookup_key=PRICE_LOOKUP_KEY,
        metadata={"free_units": str(FREE_UNITS)},
    )
    print(f"Created price: {price.id}")
    return price


def main():
    mode = "test" if stripe.api_key and "test" in stripe.api_key else "LIVE"
    print(f"Using Stripe {mode} mode")
    print()

    meter = ensure_meter()
    product = ensure_product()
    price = ensure_price(product, meter)

    print()
    print("Stripe setup complete:")
    print(f"  Meter:   {meter.id} ({METER_EVENT_NAME})")
    print(f"  Product: {product.id} (Canonizr API)")
    print(f"  Price:   {price.id} (${PRICE_PER_UNIT}/100KB, {FREE_UNITS} free units/month)")


if __name__ == "__main__":
    main()
