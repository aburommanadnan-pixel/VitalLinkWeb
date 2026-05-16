// "using" lines pull in the libraries we need.
// Microsoft.AspNetCore.Mvc gives us Controller + IActionResult + the [HttpGet] attributes.
using Microsoft.AspNetCore.Mvc;

namespace VitalLinkWeb.Controllers
{
    // ════════════════════════════════════════════════════════════════════════
    //  HomeController — handles the URL "/" (the landing page).
    //
    //  In ASP.NET Core MVC, a "Controller" is a C# class whose methods
    //  ("Actions") return responses for incoming web requests.
    //  Convention: Class name MUST end in "Controller" (HomeController).
    //  ASP.NET strips that suffix to get the URL prefix → /Home.
    // ════════════════════════════════════════════════════════════════════════
    public class HomeController : Controller
    {
        // GET /  →  GET /Home  →  GET /Home/Index
        // All three URLs map here because of the default route in Program.cs.
        //
        // IActionResult = "anything that can be sent back to the browser."
        // View() is a helper that returns the matching Razor view file.
        // It looks for: Views/Home/Index.cshtml
        public IActionResult Index()
        {
            return View();
        }

        // A tiny built-in error page. Used by the global exception handler in Program.cs.
        public IActionResult Error()
        {
            return View();
        }
    }
}
