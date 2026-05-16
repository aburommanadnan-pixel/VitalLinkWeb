using Microsoft.AspNetCore.Mvc;

namespace VitalLinkWeb.Controllers
{
    // ════════════════════════════════════════════════════════════════════════
    //  AccountController — handles login + access denied pages.
    //
    //  Note: the actual sign-in work happens in JavaScript (Firebase JS SDK).
    //  These C# methods just serve the static HTML/Razor pages — the heavy
    //  lifting (sign in, read role, redirect) lives in /js/auth.js.
    // ════════════════════════════════════════════════════════════════════════
    public class AccountController : Controller
    {
        // GET /Account/Login → the login form
        public IActionResult Login()
        {
            ViewData["Title"] = "Sign In";
            // We hide the navbar nav links on the login page (passed via ViewData).
            ViewData["HideNav"] = true;
            return View();
        }

        // GET /Account/AccessDenied → shown when role doesn't match the page
        public IActionResult AccessDenied()
        {
            ViewData["Title"] = "Access Denied";
            return View();
        }
    }
}
