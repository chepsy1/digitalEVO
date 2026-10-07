(() => {
  const track = document.getElementById("deTickerTrack");
  if (!track) return;

  // Digit terakhir prefix nomor random sesuai bobot:
  // 5=20%, 1=20%, 8=15%, 2=15%, 7=15%, 9=15%.
  const phonePrefixes = [
    { prefix: "5", weight: 20 },
    { prefix: "1", weight: 20 },
    { prefix: "8", weight: 15 },
    { prefix: "2", weight: 15 },
    { prefix: "7", weight: 15 },
    { prefix: "9", weight: 15 }
  ];

  function weightedRandom(list) {
    const totalWeight = list.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;

    for (const item of list) {
      random -= item.weight;
      if (random < 0) return item.label ?? item.prefix;
    }

    return list[list.length - 1].label ?? list[list.length - 1].prefix;
  }

  function generatePhone() {
    const digit = weightedRandom(phonePrefixes);
    const maskedMiddle = "******";
    const randomLastThree = String(Math.floor(Math.random() * 1000)).padStart(3, "0");

    // Contoh: +6285******123
    return `+628${digit}${maskedMiddle}${randomLastThree}`;
  }

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

  const accountPackages = [
    { label: "Akun 10000 Followers", weight: 4 },
    { label: "Akun 20000 Followers", weight: 3 },
    { label: "Akun 30000 Followers", weight: 2 },
    { label: "Akun 50000 Followers", weight: 1 }
  ];

  function getRandomProduct() {
    if (Math.random() < 0.10) {
      return weightedRandom(accountPackages);
    }
    return weightedRandom(normalPackages);
  }

  function generateTime() {
    const random = Math.random() * 100;

    if (random < 7) {
      return `${Math.floor(Math.random() * 59) + 1} menit yang lalu`;
    }

    if (random < 37) {
      if (Math.random() < 0.60) {
        return `${Math.floor(Math.random() * 21) + 3} jam yang lalu`;
      }
      return `${Math.floor(Math.random() * 2) + 1} jam yang lalu`;
    }

    return `${Math.floor(Math.random() * 7) + 2} hari yang lalu`;
  }

  function cartIcon() {
    return `<span class="de-ticker-cart" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none"
        stroke="#ee4d2d"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round">
        <circle cx="9" cy="20" r="1.5"></circle>
        <circle cx="18" cy="20" r="1.5"></circle>
        <path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 8H6"></path>
      </svg>
    </span>`;
  }

  function generateItems() {
    let html = "";

    for (let i = 0; i < 500; i++) {
      const phone = generatePhone();
      const productLabel = getRandomProduct();
      const time = generateTime();
      const orderText = `memesan <strong>${productLabel}</strong>`;

      html += `<div class="de-ticker-item">
        ${cartIcon()}
        <span class="de-ticker-content">
          <span class="de-ticker-top">
            <span class="de-ticker-link">${phone}</span>
          </span>
          <span class="de-ticker-bottom">
            <span class="de-ticker-order">${orderText}</span>
            <span class="de-ticker-time">
              <span class="de-ticker-clock" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"
                  stroke="#8a9298"
                  stroke-width="2"
                  stroke-linecap="round">
                  <circle cx="12" cy="12" r="9"></circle>
                  <path d="M12 7v5l3 2"></path>
                </svg>
              </span>
              ${time}
            </span>
          </span>
        </span>
      </div>`;
    }

    return html;
  }

  const items = generateItems();
  track.innerHTML = items + items;
})();
