// ════════════════════════════════════════════════════════════════════════════
//  Program.cs — the FIRST file that runs when the web app starts up.
//
//  In old ASP.NET (Framework / Core 5 and earlier) this used to be split into
//  TWO files: Program.cs (host setup) and Startup.cs (services + middleware).
//  .NET 6+ merged them into one file using "minimal hosting" — what you see below.
// ════════════════════════════════════════════════════════════════════════════

// "var" lets the compiler figure out the type. (builder is a WebApplicationBuilder.)
// CreateBuilder reads appsettings.json, environment variables, command-line args, etc.
var builder = WebApplication.CreateBuilder(args);

// ─── REGISTER SERVICES ────────────────────────────────────────────────────────
// "Services" = anything the app needs to do its job (logging, MVC, DB connections...).
// AddControllersWithViews() turns on the MVC pattern: Controllers + Razor Views.
builder.Services.AddControllersWithViews();

// Build the app from the configured builder.
var app = builder.Build();

// ─── CONFIGURE THE HTTP REQUEST PIPELINE ──────────────────────────────────────
// Each "Use..." line adds a piece of middleware. They run IN ORDER for every request.

// In production (real server), redirect users from http:// to https:// for security.
// In development (your laptop), we skip this so it works without an SSL certificate.
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();          // tells browsers "always use HTTPS for this site"
    app.UseExceptionHandler("/Home/Error"); // friendly error page in production
}

app.UseHttpsRedirection();  // automatic http → https redirect

// UseStaticFiles() makes everything inside /wwwroot/ available to browsers.
// e.g. /wwwroot/css/site.css → http://yoursite/css/site.css
app.UseStaticFiles();

// Routing decides WHICH controller + action runs for an incoming URL.
app.UseRouting();

// MapControllerRoute defines the URL pattern.
// Default: /Home/Index → HomeController.Index() — the landing page.
// /Er           → ErController.Index()
// /Management   → ManagementController.Index()
app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

// Start the web server. This blocks until the app is shut down (Ctrl+C / VS stop button).
app.Run();
