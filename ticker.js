(() => {
  const track = document.getElementById("deTickerTrack");
  if (!track) return;

  const normalPackages = [
    { label: "500 Followers", weight: 24 },
    { label: "100 Followers", weight: 22 },
    { label: "1000 Followers", weight: 32 },
    { label: "1500 Followers", weight: 20 },
    { label: "200 Followers", weight: 15 },
    { label: "300 Followers", weight: 15 },
    { label: "3000 Followers", weight: 15 },
    { label: "5000 Followers", weight: 10 }
  ];

  function weightedRandom(list) {
    const total = list.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * total;
    for (const item of list) {
      roll -= item.weight;
      if (roll < 0) return item.label;
    }
    return list[list.length - 1].label;
  }

  // Kuota tetap sesuai daftar: total 45 item khusus + 455 paket followers.
  const fixedPackages = [
    ...Array(4).fill("10 (Custom) Comments"),
    ...Array(2).fill("20 (Custom) Comments"),
    ...Array(4).fill("100 Favorite/Likes"),
    ...Array(5).fill("200 Favorite/Likes"),
    ...Array(1).fill("500 Favorite/Likes"),
    ...Array(5).fill("Shopee Followers — 10.000 Followers"),
    ...Array(6).fill("Shopee Video 2000 Views"),
    ...Array(6).fill("Shopee Video 5000 Views"),
    ...Array(6).fill("Shopee Video 7000 Views"),
    ...Array(6).fill("Shopee Video 10000 Views")
  ];

  const products = [
    ...fixedPackages,
    ...Array.from({ length: 455 }, () => weightedRandom(normalPackages))
  ];

  // Acak posisi seluruh 500 item.
  for (let i = products.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [products[i], products[j]] = [products[j], products[i]];
  }

  // Lima entri memakai nomor contoh tersamarkan; bukan nomor pelanggan.
  const displayNames = Array(5).fill("+6283******xxx")
    .concat(Array(495).fill("DigitalEVO"));
  for (let i = displayNames.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [displayNames[i], displayNames[j]] = [displayNames[j], displayNames[i]];
  }

  function cartIcon() {
    return `<span class="de-ticker-cart" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="#ee4d2d"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="9" cy="20" r="1.5"></circle>
        <circle cx="18" cy="20" r="1.5"></circle>
        <path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 8H6"></path>
      </svg>
    </span>`;
  }

  function generateItems() {
    return products.map((productLabel, index) => `
      <div class="de-ticker-item">
        ${cartIcon()}
        <span class="de-ticker-content">
          <span class="de-ticker-top">
            <span class="de-ticker-link">${displayNames[index]}</span>
          </span>
          <span class="de-ticker-bottom">
            <span class="de-ticker-order">pilihan paket <strong>${productLabel}</strong></span>
          </span>
        </span>
      </div>
    `).join("");
  }

  const items = generateItems();
  track.innerHTML = items + items;
})();