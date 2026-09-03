"""Create a farm or rotate its owner credential from deployment secrets."""

import os

from app.main import db_client


def required_environment(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise SystemExit(f"{name} is required")
    return value


def main() -> None:
    result = db_client().rpc(
        "provision_farm_owner",
        {
            "p_farm_code": required_environment("FARM_CODE"),
            "p_display_name": required_environment("FARM_DISPLAY_NAME"),
            "p_pin": required_environment("FARM_OWNER_PIN"),
        },
    ).execute()
    if not getattr(result, "data", None):
        raise SystemExit("farm owner provisioning failed")
    print("farm owner provisioned")


if __name__ == "__main__":
    main()
