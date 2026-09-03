"""Create or rotate one demo farm owner from a deployment-only PIN secret."""

import os

from app.main import db_client


def main() -> None:
    pin = os.getenv("DEMO_OWNER_PIN")
    if not pin:
        raise SystemExit("DEMO_OWNER_PIN is required")
    farm_slug = os.getenv("DEMO_FARM_SLUG", "demo-farm")
    result = db_client().rpc("seed_demo_owner", {"p_farm_slug": farm_slug, "p_pin": pin}).execute()
    if not getattr(result, "data", None):
        raise SystemExit("demo owner seed failed")
    print(f"demo owner seeded for farm {farm_slug}")


if __name__ == "__main__":
    main()
