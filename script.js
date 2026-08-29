// Footer year
document.getElementById("year").textContent = new Date().getFullYear();

// Header behaviour
const nav = document.querySelector('.nav');

function updateHeaderState() {
  if (!nav) return;
  nav.classList.toggle('is-scrolled', window.scrollY > 12);
}

window.addEventListener('scroll', () => {
  window.requestAnimationFrame(updateHeaderState);
}, { passive: true });
window.addEventListener('load', updateHeaderState);
updateHeaderState();

// Mobile menu
const btn = document.getElementById("menuBtn");
const menu = document.getElementById("mobileMenu");

function setMenu(open) {
  if (!btn || !menu) return;
  btn.setAttribute("aria-expanded", String(open));
  menu.style.display = open ? "block" : "none";
  menu.setAttribute("aria-hidden", String(!open));
}

if (btn && menu) {
  setMenu(false);

  btn.addEventListener("click", () => {
    const isOpen = btn.getAttribute("aria-expanded") === "true";
    setMenu(!isOpen);
  });

  menu.addEventListener("click", (e) => {
    const target = e.target;
    if (target && target.tagName === "A") setMenu(false);
  });
}

// Reveal on scroll
const revealEls = document.querySelectorAll('.reveal');
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

revealEls.forEach((el) => revealObserver.observe(el));
