using Microsoft.AspNetCore.Mvc;

namespace VitalLinkWeb.Controllers
{
    public class DisasterController : Controller
    {
        public IActionResult Index()
        {
            ViewData["Title"] = "Disaster Alert";
            return View();
        }
    }
}