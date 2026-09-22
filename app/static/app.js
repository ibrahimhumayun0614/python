(() => {
  const state = {
    step: 1,
    files: [],
    jobId: null,
    convertedFiles: [],
    targetFormat: "jpg",
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  const dropzone = $("#dropzone");
  const fileInput = $("#file-input");
  const fileList = $("#file-list");
  const convertBtn = $("#btn-convert");
  const formatSelect = $("#target-format");
  const patternInput = $("#pattern");
  const previewBox = $("#preview-box");
  const alertBox = $("#alert");
  const convertSummary = $("#convert-summary");
  const progressPanel = $("#progress-panel");
  const progressLabel = $("#progress-label");
  const progressEta = $("#progress-eta");
  const progressBar = $("#progress-bar");
  const progressTrack = progressPanel.querySelector(".progress-track");
  const progressCurrent = $("#progress-current");

  function formatDetail(detail) {
    if (!detail) return "";
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail.map((d) => d.msg || JSON.stringify(d)).join(" · ");
    }
    return String(detail);
  }

  function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0) return "—";
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    if (totalSec < 1) return "less than 1s";
    if (totalSec < 60) return `about ${totalSec}s`;
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    if (mins < 60) {
      return secs ? `about ${mins}m ${secs}s` : `about ${mins}m`;
    }
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return remMins ? `about ${hours}h ${remMins}m` : `about ${hours}h`;
  }

  function setProgress(done, total, currentName, startedAt) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    progressLabel.textContent = `Converting ${done} of ${total}`;
    progressBar.style.width = `${pct}%`;
    progressTrack.setAttribute("aria-valuenow", String(pct));
    progressCurrent.textContent = currentName
      ? `Current: ${currentName}`
      : done >= total
        ? "Finishing…"
        : "Starting…";

    if (done === 0) {
      progressEta.textContent = "Estimating…";
      return;
    }

    const elapsed = performance.now() - startedAt;
    const avg = elapsed / done;
    const remaining = Math.max(0, total - done);
    if (remaining === 0) {
      progressEta.textContent = "Done";
    } else {
      progressEta.textContent = `${formatDuration(avg * remaining)} left`;
    }
  }

  function showProgress(show) {
    progressPanel.classList.toggle("hidden", !show);
    if (!show) {
      progressBar.style.width = "0%";
      progressTrack.setAttribute("aria-valuenow", "0");
    }
  }

  function setStep(n) {
    state.step = n;
    $$(".panel").forEach((p) => p.classList.toggle("active", Number(p.dataset.step) === n));
    $$(".step-pill").forEach((pill) => {
      const s = Number(pill.dataset.step);
      pill.classList.toggle("active", s === n);
      pill.classList.toggle("done", s < n);
    });
    clearAlert();
  }

  function showAlert(message, type = "error") {
    alertBox.className = `alert alert-${type}`;
    alertBox.textContent = message;
    alertBox.classList.remove("hidden");
  }

  function clearAlert() {
    alertBox.classList.add("hidden");
    alertBox.textContent = "";
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function renderFiles() {
    fileList.innerHTML = "";
    if (!state.files.length) {
      convertBtn.disabled = true;
      return;
    }
    state.files.forEach((file, idx) => {
      const row = document.createElement("div");
      row.className = "file-row";
      row.innerHTML = `
        <div class="name" title="${file.name}">${file.name}</div>
        <div class="meta">${formatBytes(file.size)}</div>
        <button type="button" class="btn btn-ghost" data-remove="${idx}" aria-label="Remove">✕</button>
      `;
      fileList.appendChild(row);
    });
    convertBtn.disabled = false;
  }

  function addFiles(fileListLike) {
    const incoming = [...fileListLike].filter((f) =>
      /\.(png|jpe?g|webp|bmp|gif|tiff?)$/i.test(f.name)
    );
    if (!incoming.length) {
      showAlert("Please select image files (PNG, JPG, WEBP, BMP, GIF, TIFF).");
      return;
    }
    const names = new Set(state.files.map((f) => f.name + f.size));
    for (const f of incoming) {
      const key = f.name + f.size;
      if (!names.has(key)) {
        state.files.push(f);
        names.add(key);
      }
    }
    clearAlert();
    renderFiles();
  }

  dropzone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    addFiles(fileInput.files);
    fileInput.value = "";
  });

  ["dragenter", "dragover"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    });
  });
  dropzone.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));

  fileList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-remove]");
    if (!btn) return;
    state.files.splice(Number(btn.dataset.remove), 1);
    renderFiles();
  });

  function setLoading(btn, loading, label) {
    if (loading) {
      btn.disabled = true;
      btn.dataset.label = btn.innerHTML;
      btn.innerHTML = `<span class="spinner"></span>${label || "Working…"}`;
    } else {
      btn.disabled = false;
      btn.innerHTML = btn.dataset.label || btn.innerHTML;
    }
  }

  function setConvertingUi(busy) {
    formatSelect.disabled = busy;
    dropzone.style.pointerEvents = busy ? "none" : "";
    dropzone.style.opacity = busy ? "0.6" : "";
    fileList.querySelectorAll("button").forEach((b) => {
      b.disabled = busy;
    });
  }

  convertBtn.addEventListener("click", async () => {
    if (!state.files.length) return;
    clearAlert();

    const total = state.files.length;
    const startedAt = performance.now();
    const errors = [];

    setLoading(convertBtn, true, "Converting…");
    setConvertingUi(true);
    showProgress(true);
    setProgress(0, total, null, startedAt);

    let jobId = null;

    try {
      const startForm = new FormData();
      startForm.append("target_format", formatSelect.value);
      const startRes = await fetch("/api/convert/start", {
        method: "POST",
        body: startForm,
      });
      const startData = await startRes.json();
      if (!startRes.ok) {
        throw new Error(formatDetail(startData.detail) || "Could not start conversion");
      }
      jobId = startData.job_id;

      for (let i = 0; i < state.files.length; i++) {
        const file = state.files[i];
        progressCurrent.textContent = `Current: ${file.name}`;
        progressEta.textContent =
          i === 0 ? "Estimating…" : progressEta.textContent;

        const form = new FormData();
        form.append("job_id", jobId);
        form.append("file", file, file.name);

        const res = await fetch("/api/convert/one", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) {
          errors.push(formatDetail(data.detail) || `Failed: ${file.name}`);
          setProgress(i + 1, total, file.name, startedAt);
          continue;
        }
        setProgress(i + 1, total, file.name, startedAt);
      }

      const finishForm = new FormData();
      finishForm.append("job_id", jobId);
      const finishRes = await fetch("/api/convert/finish", {
        method: "POST",
        body: finishForm,
      });
      const finishData = await finishRes.json();
      if (!finishRes.ok) {
        throw new Error(
          formatDetail(finishData.detail) ||
            errors[0] ||
            "Conversion failed"
        );
      }

      state.jobId = finishData.job_id;
      state.convertedFiles = finishData.files;
      state.targetFormat = finishData.target_format;

      convertSummary.innerHTML = `
        Converted <strong>${finishData.count}</strong> image(s) to
        <strong>${finishData.target_format.toUpperCase()}</strong>
        in ${formatDuration(performance.now() - startedAt)}.
      `;
      if (errors.length) {
        showAlert(errors.join(" · "), "info");
      }
      showProgress(false);
      setStep(2);
    } catch (err) {
      showProgress(false);
      showAlert(err.message || "Conversion failed");
      if (jobId) {
        try {
          await fetch(`/api/job/${jobId}`, { method: "DELETE" });
        } catch (_) {
          /* ignore */
        }
      }
    } finally {
      setLoading(convertBtn, false);
      setConvertingUi(false);
      convertBtn.disabled = !state.files.length;
    }
  });

  $("#btn-skip-rename").addEventListener("click", () => {
    setStep(4);
    $("#done-title").textContent = "Ready to download";
    $("#done-message").textContent =
      "Your converted images are ready. Download them as a ZIP.";
  });

  $("#btn-want-rename").addEventListener("click", () => {
    patternInput.value = "001";
    updatePreview();
    setStep(3);
  });

  let previewTimer = null;
  patternInput.addEventListener("input", () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 200);
  });

  async function updatePreview() {
    const pattern = patternInput.value.trim();
    if (!pattern || !state.jobId) {
      previewBox.innerHTML = `<code class="hint">Enter a pattern ending with digits</code>`;
      return;
    }
    try {
      const form = new FormData();
      form.append("job_id", state.jobId);
      form.append("pattern", pattern);
      const res = await fetch("/api/preview-rename", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(formatDetail(data.detail) || "Invalid pattern");
      previewBox.innerHTML = data.preview
        .slice(0, 12)
        .map((n) => `<code>${n}</code>`)
        .join("");
      if (data.preview.length > 12) {
        previewBox.innerHTML += `<code class="hint">…and ${data.preview.length - 12} more</code>`;
      }
      $("#btn-apply-rename").disabled = false;
      clearAlert();
    } catch (err) {
      previewBox.innerHTML = `<code class="hint">${err.message}</code>`;
      $("#btn-apply-rename").disabled = true;
    }
  }

  $("#btn-apply-rename").addEventListener("click", async () => {
    const pattern = patternInput.value.trim();
    if (!pattern || !state.jobId) return;
    const btn = $("#btn-apply-rename");
    setLoading(btn, true, "Renaming…");
    clearAlert();
    try {
      const form = new FormData();
      form.append("job_id", state.jobId);
      form.append("pattern", pattern);
      const res = await fetch("/api/rename", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(formatDetail(data.detail) || "Rename failed");

      setStep(4);
      $("#done-title").textContent = "Renamed & ready";
      $("#done-message").textContent = `Renamed ${data.count} file(s). Download the ZIP below.`;
    } catch (err) {
      showAlert(err.message || "Rename failed");
    } finally {
      setLoading(btn, false);
    }
  });

  $("#btn-download").addEventListener("click", () => {
    if (!state.jobId) return;
    window.location.href = `/api/download/${state.jobId}`;
  });

  $("#btn-start-over").addEventListener("click", async () => {
    if (state.jobId) {
      try {
        await fetch(`/api/job/${state.jobId}`, { method: "DELETE" });
      } catch (_) {
        /* ignore */
      }
    }
    state.files = [];
    state.jobId = null;
    state.convertedFiles = [];
    showProgress(false);
    renderFiles();
    setStep(1);
  });

  $("#btn-back-convert").addEventListener("click", () => setStep(2));

  setStep(1);
  renderFiles();
})();
