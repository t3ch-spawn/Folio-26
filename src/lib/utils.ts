export function disableLenis() {
  const body = document.querySelector("body");
  body?.classList.add("active");
  body?.setAttribute("data-lenis-prevent", "");
}

export function enableLenis() {
  const body = document.querySelector("body");
  body?.classList.remove("active");
  body?.removeAttribute("data-lenis-prevent");
}
