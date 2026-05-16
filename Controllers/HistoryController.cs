using Microsoft.AspNetCore.Mvc;

namespace VitalLinkWeb.Controllers
{
    // ════════════════════════════════════════════════════════════════════════
    //  HistoryController — serves /History (the alert history archive).
    //  Available to all logged-in users. Read-only.
    // ════════════════════════════════════════════════════════════════════════
    public class HistoryController : Controller
    {
        public IActionResult Index()
        {
            ViewData["Title"] = "Alert History";
            return View();
        }
    }
}
