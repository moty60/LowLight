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

async function downloadAllAsZip(zipName, images, button) {
  button.textContent = "Preparing ZIP...";
  button.style.pointerEvents = "none";

  const zip = new JSZip();

  for (let i = 0; i < images.length; i++) {
    const item = images[i];
    const url = item.url;
    const filename = item.filename || url.split("/").pop() || `image-${i + 1}.jpg`;

    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Failed fetching: " + url);
    const blob = await resp.blob();
    zip.file(filename, blob);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = zipName || "lowlight-gallery.zip";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);

  button.textContent = "Download all (ZIP)";
  button.style.pointerEvents = "";
}

(async () => {
  const titleEl = document.getElementById("title");
  const metaEl = document.getElementById("meta");
  const noteEl = document.getElementById("note");
  const gridEl = document.getElementById("grid");
  const emptyEl = document.getElementById("empty");
  const openFolderEl = document.getElementById("openFolder");
  const downloadAllEl = document.getElementById("downloadAll");

  try {
    const manifest = await loadManifest();

    // Set header text immediately
    if (titleEl) titleEl.textContent = manifest.title || "Client Gallery";
    if (metaEl) metaEl.textContent = manifest.subtitle || "";
    if (noteEl) noteEl.textContent = manifest.note || "";

    // Normalize images so we don't crash if format changes
    const images = normalizeImages(manifest.images);

    // folder link (simple/manual option)
    if (openFolderEl) openFolderEl.href = manifest.openFolder || "./full/";

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

        const preview = el(
          "a",
          {
            class: "preview",
            href: fullUrl,
            target: "_blank",
            rel: "noopener",
          },
          [
            el("img", {
              src: thumbUrl,
              alt: img.alt || humanIndex(i),
              loading: "lazy",
              decoding: "async",
            }),
          ]
        );

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

        const tile = el("div", { class: "tile" }, [preview, tileBar]);
        gridEl.appendChild(tile);
      });
    }

    // ZIP download (only if button exists)
    if (downloadAllEl) {
      downloadAllEl.addEventListener("click", (e) => {
        e.preventDefault();
        downloadAllAsZip(manifest.zipName, images, downloadAllEl).catch((err) => {
          console.error(err);
          downloadAllEl.textContent = "ZIP failed (too many/big files)";
          setTimeout(() => (downloadAllEl.textContent = "Download all (ZIP)"), 2500);
        });
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

