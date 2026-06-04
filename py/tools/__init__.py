# Re-export all tool registration functions so server.py can import them cleanly.
from .apps import register_app_tools
from .tables import register_table_tools
from .records import register_record_tools
from .reports import register_report_tools

__all__ = [
    "register_app_tools",
    "register_table_tools",
    "register_record_tools",
    "register_report_tools",
]
