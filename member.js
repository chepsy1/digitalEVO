(() => {
  const tabs = [...document.querySelectorAll(".tab")];
  const views = {
    login: document.getElementById("login-view"),
    register: document.getElementById("register-view")
  };
  const notice = document.getElementById("notice");

  function switchView(name) {
    const showRegister = name === "register";
    views.login.hidden = showRegister;
    views.register.hidden = !showRegister;
    tabs.forEach(tab => {
      const active = tab.id === (showRegister ? "register-tab" : "login-tab");
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    notice.textContent = "Tampilan awal sedang disiapkan. Pendaftaran dan login belum terhubung ke server.";
  }

  tabs.forEach(tab => tab.addEventListener("click", () => {
    switchView(tab.id === "register-tab" ? "register" : "login");
  }));
  document.querySelectorAll("[data-switch]").forEach(button => {
    button.addEventListener("click", () => switchView(button.dataset.switch));
  });

  document.getElementById("register-form").addEventListener("submit", event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirm = String(form.get("confirmPassword") || "");
    if (password !== confirm) {
      notice.textContent = "Konfirmasi password tidak sama.";
      document.getElementById("register-confirm").focus();
      return;
    }
    notice.textContent = "Form sudah diperiksa, tetapi pendaftaran belum aktif karena verifikasi pembayaran dan penyimpanan akun server belum dipasang.";
  });

  document.getElementById("login-form").addEventListener("submit", event => {
    event.preventDefault();
    notice.textContent = "Login belum aktif. Sistem autentikasi server akan dipasang sebelum halaman digunakan oleh pembeli.";
  });
})();