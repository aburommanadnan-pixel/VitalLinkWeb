using Microsoft.AspNetCore.Mvc;

namespace VitalLinkWeb.Controllers
{
    // ════════════════════════════════════════════════════════════════════════
    //  ManagementController — handles "/Management".
    //  This is the higher-level dashboard for emergency-management staff:
    //  KPI tiles, recent alerts table, hospitals list, alerts-over-time chart.
    // ════════════════════════════════════════════════════════════════════════
    public class ManagementController : Controller
    {
        // GET /Management  →  Views/Management/Index.cshtml
        public IActionResult Index()
        {
            ViewData["Title"] = "Emergency Management Dashboard";
            return View();
        }
    }
}
