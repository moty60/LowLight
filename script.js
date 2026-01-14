// Footer year
document.getElementById("year").textContent = new Date().getFullYear();

// Mobile menu
const btn = document.getElementById("menuBtn");
const menu = document.getElementById("mobileMenu");

function setMenu(open) {
  btn.setAttribute("aria-expanded", String(open));
  menu.style.display = open ? "block" : "none";
  menu.setAttribute("aria-hidden", String(!open));
}

setMenu(false);

btn.addEventListener("click", () => {
  const isOpen = btn.getAttribute("aria-expanded") === "true";
  setMenu(!isOpen);
});

// Close menu on link click
menu.addEventListener("click", (e) => {
  const target = e.target;
  if (target && target.tagName === "A") setMenu(false);
});
