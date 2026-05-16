using Microsoft.AspNetCore.Mvc;

namespace VitalLinkWeb.Controllers
{
    // ════════════════════════════════════════════════════════════════════════
    //  AdminController — admin-only utilities (currently just the migration tool).
    //  /Admin/Migrate runs a one-time import of legacy /alerts data into the
    //  new active_alerts + alert_history schema.
    // ════════════════════════════════════════════════════════════════════════
    public class AdminController : Controller
    {
        public IActionResult Migrate()
        {
            ViewData["Title"] = "Schema Migration";
            return View();
        }
    }
}
