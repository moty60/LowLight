import { downloadZip } from "https://cdn.jsdelivr.net/npm/client-zip@2.5.0/index.js";

const ZIP_CONCURRENCY = 4;

async function loadManifest() {
  // Resolve manifest against current page URL (robust on GitHub Pages)
  const manifestUrl = new URL("manifest.json", window.location.href).toString();

  const res = await fetch(manifestUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch manifest (${res.status}) at: ${manifestUrl}`);
  }
  return res.json();
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else node.setAttribute(k, v);
  });
  children.forEach((c) => node.appendChild(c));
  return node;
}

function humanIndex(i) {
  const n = String(i + 1).padStart(3, "0");
  return `Photo ${n}`;
}

// Normalize images so we support both:
// 1) objects: [{ url, thumb, filename }]
// 2) strings: ["./full/001.jpg", ...]
function normalizeImages(images) {
  if (!Array.isArray(images)) return [];

  return images
    .map((img, i) => {
      if (typeof img === "string") {
        const url = img;
        const filename = url.split("/").pop() || `image-${i + 1}.jpg`;
        return { url, filename, thumb: url };
      }

      if (img && typeof img === "object") {
        const url = img.url;
        if (!url || typeof url !== "string") return null;

        const filename =
          (typeof img.filename === "string" && img.filename) ||
          url.split("/").pop() ||
          `image-${i + 1}.jpg`;

        const thumb =
          (typeof img.thumb === "string" && img.thumb) ||
          url;

        const alt = (typeof img.alt === "string" && img.alt) ? img.alt : "";

        return { url, filename, thumb, alt };
      }

      return null;
    })
    .filter(Boolean);
}

// Fetches images with a concurrency cap, yielding {name, input} entries
// for client-zip in original order as each fetch completes.
async function* concurrentFileEntries(images, concurrency, onProgress) {
  const total = images.length;
  const inFlight = new Map();
  let launched = 0;

  const launch = (i) => {
    const item = images[i];
    inFlight.set(
      i,
      fetch(item.url).then((resp) => {
        if (!resp.ok) throw new Error(`Failed fetching: ${item.url}`);
        return { name: item.filename, input: resp };
      })
    );
  };

  while (launched < Math.min(concurrency, total)) {
    launch(launched);
    launched++;
  }

  for (let i = 0; i < total; i++) {
    const entry = await inFlight.get(i);
    inFlight.delete(i);
    onProgress(i + 1, total);
    if (launched < total) {
      launch(launched);
      launched++;
    }
    yield entry;
  }
}

async function downloadImagesAsZip(zipName, images, button, idleLabel) {
  if (!images.length || button.dataset.zipping === "1") return;

  button.dataset.zipping = "1";
  button.style.pointerEvents = "none";
  const setProgress = (done, total) => {
    const pct = Math.round((done / total) * 100);
    button.textContent = `Zipping... ${done}/${total} (${pct}%)`;
  };
  setProgress(0, images.length);

  try {
    const entries = concurrentFileEntries(images, ZIP_CONCURRENCY, setProgress);
    const zipResponse = downloadZip(entries);
    const name = zipName || "lowlight-gallery.zip";

    if (window.streamSaver && zipResponse.body && zipResponse.body.pipeTo) {
      const fileStream = streamSaver.createWriteStream(name);
      await zipResponse.body.pipeTo(fileStream);
    } else {
      // Fallback for browsers without writable-stream support: buffers the
      // finished zip once (still avoids buffering each source image twice).
      const blob = await zipResponse.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    }

    button.textContent = idleLabel;
  } catch (err) {
    console.error(err);
    button.textContent = "ZIP failed - try again";
    setTimeout(() => (button.textContent = idleLabel), 2500);
  } finally {
    button.dataset.zipping = "0";
    button.style.pointerEvents = "";
  }
}

(async () => {
  const titleEl = document.getElementById("title");
  const metaEl = document.getElementById("meta");
  const noteEl = document.getElementById("note");
  const gridEl = document.getElementById("grid");
  const emptyEl = document.getElementById("empty");
  const downloadAllEl = document.getElementById("downloadAll");
  const selectToggleEl = document.getElementById("selectToggle");
  const downloadSelectedEl = document.getElementById("downloadSelected");

  const lightboxEl = document.getElementById("lightbox");
  const lbImg = document.getElementById("lbImg");
  const lbCaption = document.getElementById("lbCaption");
  const lbClose = document.getElementById("lbClose");
  const lbPrev = document.getElementById("lbPrev");
  const lbNext = document.getElementById("lbNext");

  let images = [];
  let selecting = false;
  const selected = new Set();
  let lightboxIndex = -1;

  function openLightbox(i) {
    lightboxIndex = i;
    const img = images[i];
    lbImg.src = img.url;
    lbImg.alt = img.alt || humanIndex(i);
    lbCaption.textContent = `${humanIndex(i)} of ${images.length}`;
    lightboxEl.hidden = false;
  }

  function closeLightbox() {
    lightboxEl.hidden = true;
    lbImg.src = "";
    lightboxIndex = -1;
  }

  function stepLightbox(delta) {
    if (lightboxIndex === -1) return;
    const next = (lightboxIndex + delta + images.length) % images.length;
    openLightbox(next);
  }

  lbClose.addEventListener("click", closeLightbox);
  lbPrev.addEventListener("click", () => stepLightbox(-1));
  lbNext.addEventListener("click", () => stepLightbox(1));
  lightboxEl.addEventListener("click", (e) => {
    if (e.target === lightboxEl) closeLightbox();
  });
  document.addEventListener("keydown", (e) => {
    if (lightboxEl.hidden) return;
    if (e.key === "Escape") closeLightbox();
    else if (e.key === "ArrowLeft") stepLightbox(-1);
    else if (e.key === "ArrowRight") stepLightbox(1);
  });

  function updateDownloadSelectedLabel() {
    if (downloadSelectedEl.dataset.zipping === "1") return;
    downloadSelectedEl.textContent = `Download selected (${selected.size})`;
    downloadSelectedEl.disabled = selected.size === 0;
  }

  selectToggleEl.addEventListener("click", () => {
    selecting = !selecting;
    gridEl.classList.toggle("selecting", selecting);
    selectToggleEl.textContent = selecting ? "Cancel select" : "Select photos";
    downloadSelectedEl.hidden = !selecting;
    if (!selecting) {
      selected.clear();
      gridEl.querySelectorAll(".tile.selected").forEach((t) => t.classList.remove("selected"));
      gridEl.querySelectorAll(".tile-select input").forEach((c) => (c.checked = false));
    }
    updateDownloadSelectedLabel();
  });

  downloadSelectedEl.addEventListener("click", () => {
    const chosen = images.filter((_, i) => selected.has(i));
    const base = (downloadAllEl.dataset.zipName || "lowlight-gallery.zip").replace(/\.zip$/i, "");
    downloadImagesAsZip(`${base}-selected.zip`, chosen, downloadSelectedEl, `Download selected (${selected.size})`);
  });

  try {
    const manifest = await loadManifest();

    // Set header text immediately
    if (titleEl) titleEl.textContent = manifest.title || "Client Gallery";
    if (metaEl) metaEl.textContent = manifest.subtitle || "";
    if (noteEl) noteEl.textContent = manifest.note || "";
    if (downloadAllEl) downloadAllEl.dataset.zipName = manifest.zipName || "lowlight-gallery.zip";

    // Normalize images so we don't crash if format changes
    images = normalizeImages(manifest.images);

    // If no images, show helpful message
    if (!images.length) {
      if (emptyEl) {
        emptyEl.style.display = "block";
        emptyEl.textContent =
          "No images found in manifest. Check manifest.json -> images[] and that /full/ contains files.";
      }
      return;
    }

    // Build tiles safely
    if (gridEl) {
      images.forEach((img, i) => {
        // Defensive guard
        if (!img || !img.url) return;

        const fullUrl = img.url;
        const thumbUrl = img.thumb || img.url;
        const filename = img.filename || fullUrl.split("/").pop() || `image-${i + 1}.jpg`;

        const imgEl = el("img", {
          src: thumbUrl,
          alt: img.alt || humanIndex(i),
          loading: "lazy",
          decoding: "async",
        });

        const preview = el(
          "a",
          {
            class: "preview",
            href: fullUrl,
            target: "_blank",
            rel: "noopener",
          },
          [imgEl]
        );
        preview.addEventListener("click", (e) => {
          e.preventDefault();
          openLightbox(i);
        });

        const downloadBtn = el(
          "a",
          {
            class: "btn-mini",
            href: fullUrl,
            download: filename,
          },
          [document.createTextNode("Download")]
        );

        const viewBtn = el(
          "a",
          {
            class: "btn-mini btn-mini-ghost",
            href: fullUrl,
            target: "_blank",
            rel: "noopener",
          },
          [document.createTextNode("View")]
        );

        const tileBar = el("div", { class: "tile-bar" }, [
          el("div", { class: "chip" }, [document.createTextNode(humanIndex(i))]),
          el("div", { class: "tile-actions" }, [viewBtn, downloadBtn]),
        ]);

        const checkbox = el("input", { type: "checkbox", "aria-label": `Select ${humanIndex(i)}` });
        const selectWrap = el("label", { class: "tile-select" }, [checkbox]);

        const tile = el("div", { class: "tile is-loading" }, [preview, selectWrap, tileBar]);

        const clearLoading = () => tile.classList.remove("is-loading");
        imgEl.addEventListener("load", clearLoading);
        imgEl.addEventListener("error", clearLoading);
        if (imgEl.complete) clearLoading();

        checkbox.addEventListener("change", () => {
          if (checkbox.checked) selected.add(i);
          else selected.delete(i);
          tile.classList.toggle("selected", checkbox.checked);
          updateDownloadSelectedLabel();
        });

        gridEl.appendChild(tile);
      });
    }

    // ZIP download (only if button exists)
    if (downloadAllEl) {
      downloadAllEl.addEventListener("click", (e) => {
        e.preventDefault();
        downloadImagesAsZip(downloadAllEl.dataset.zipName, images, downloadAllEl, "Download all (ZIP)");
      });
    }

    // Hide empty message if we rendered something
    if (emptyEl) emptyEl.style.display = "none";
  } catch (err) {
    console.error("Gallery load failed:", err);

    if (emptyEl) {
      emptyEl.style.display = "block";
      // Show the real error so you can debug fast next time
      emptyEl.textContent = `Gallery failed to load: ${err && err.message ? err.message : err}`;
    }
  }
})();
