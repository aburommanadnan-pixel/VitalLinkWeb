using Microsoft.AspNetCore.Mvc;

namespace VitalLinkWeb.Controllers
{
    // ════════════════════════════════════════════════════════════════════════
    //  HospitalsController — serves /Hospitals (manual hospital management).
    //  Available to management + admin only. Allows add/edit/delete.
    //
    //  Just like AccountController, the actual writes happen in JavaScript;
    //  this controller only serves the page.
    // ════════════════════════════════════════════════════════════════════════
    public class HospitalsController : Controller
    {
        public IActionResult Index()
        {
            ViewData["Title"] = "Manage Hospitals";
            return View();
        }
    }
}
