using Microsoft.AspNetCore.Mvc;

namespace VitalLinkWeb.Controllers
{
    // ════════════════════════════════════════════════════════════════════════
    //  ErController — handles URLs that start with "/Er".
    //  Specifically: /Er  → Er/Index → Views/Er/Index.cshtml
    // ════════════════════════════════════════════════════════════════════════
    public class ErController : Controller
    {
        // GET /Er  or  GET /Er/Index
        public IActionResult Index()
        {
            // Set a "page title" that the shared layout (_Layout.cshtml) reads
            // via @ViewData["Title"]. Same idea as window.title in JS.
            ViewData["Title"] = "ER Staff Dashboard";
            return View();
        }
    }
}
