(function () {
    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    const monthSelect = document.getElementById('month');
    const yearSlider = document.getElementById('yearSlider');
    const daysContainer = document.getElementById('days');

    if (!monthSelect || !yearSlider || !daysContainer) {
        return;
    }

    const today = new Date();
    let currentMonth = today.getMonth();
    let currentYear = today.getFullYear();

    let yearElements = {};

    /**
     * Builds a map of ISO-date -> array of leave types for quick lookup.
     */
    function buildLeaveMap() {
        const leaveMap = {};
        if (window.USER_LEAVES) {
            Object.values(window.USER_LEAVES).forEach(firm => {
                const taken = firm.leaves_taken || {};
                Object.entries(taken).forEach(([type, dates]) => {
                    dates.forEach(dateStr => {
                        if (!leaveMap[dateStr]) leaveMap[dateStr] = [];
                        leaveMap[dateStr].push(type);
                    });
                });
            });
        }
        return leaveMap;
    }

    /**
     * Pads a number to two digits.
     */
    function pad(num) {
        return String(num).padStart(2, '0');
    }

    function populateControls() {
        monthNames.forEach((m, i) => {
            const opt = new Option(m, i);
            monthSelect.add(opt);
        });

        const startYear = currentYear - 50;
        const endYear = currentYear + 50;
        for (let y = startYear; y <= endYear; y++) {
            const yearDiv = document.createElement('div');
            yearDiv.textContent = y;
            yearDiv.classList.add('year-item');
            yearDiv.dataset.year = y;
            yearDiv.onclick = () => {
                currentYear = y; // Only update currentYear on click
                updateCalendar();
                scrollToYear(y);
            };
            yearSlider.appendChild(yearDiv);
            yearElements[y] = yearDiv;
        }

        monthSelect.value = currentMonth;

        document.getElementById('prev').onclick = () => {
            currentMonth--;
            if (currentMonth < 0) {
                currentMonth = 11;
                currentYear--;
            }
            monthSelect.value = currentMonth;
            updateCalendar();
            scrollToYear(currentYear);
        };
        document.getElementById('next').onclick = () => {
            currentMonth++;
            if (currentMonth > 11) {
                currentMonth = 0;
                currentYear++;
            }
            monthSelect.value = currentMonth;
            updateCalendar();
            scrollToYear(currentYear);
        };
    }

    function updateCalendar() {
        daysContainer.innerHTML = '';
        const rawFirst = new Date(currentYear, currentMonth, 1).getDay();
        const firstDayIndex = (rawFirst + 6) % 7;
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const leaveMap = buildLeaveMap();

        for (let i = 0; i < firstDayIndex; i++) {
            const blank = document.createElement('div');
            blank.classList.add('empty');
            daysContainer.append(blank);
        }
        for (let d = 1; d <= daysInMonth; d++) {
            const cell = document.createElement('div');
            cell.textContent = d;

            // Highlight today
            if (
                d === today.getDate() &&
                currentMonth === today.getMonth() &&
                currentYear === today.getFullYear()
            ) {
                cell.classList.add('today');
            }

            // Check if this date has leaves
            const iso = `${currentYear}-${pad(currentMonth + 1)}-${pad(d)}`;
            if (leaveMap[iso]) {
                cell.classList.add('leave-day');
                cell.style.backgroundColor = 'red';
                cell.title = leaveMap[iso].join(', ');
            }

            daysContainer.append(cell);
        }

        // Update active year class (still based on currentYear, which is updated on click/nav)
        document.querySelectorAll('.year-item').forEach(item => {
            item.classList.remove('active');
        });
        if (yearElements[currentYear]) {
            yearElements[currentYear].classList.add('active');
        }
    }

    function scrollToYear(year) {
        const targetYearElement = yearElements[year];
        if (targetYearElement) {
            const containerHeight = yearSlider.clientHeight;
            const elementHeight = targetYearElement.offsetHeight;
            const scrollTopPosition = targetYearElement.offsetTop - (containerHeight / 2) + (elementHeight / 2);

            yearSlider.scrollTo({
                top: scrollTopPosition,
                behavior: 'smooth'
            });
        }
    }

    populateControls();
    updateCalendar();
    scrollToYear(currentYear);
})();

// Account info edit mode logic
(function() {
    const editBtn = document.getElementById('edit-account-btn');
    const form = document.getElementById('account-info-form');
    const view = document.getElementById('account-info-view');
    const cancelBtn = document.getElementById('cancel-account-btn');

    if (!editBtn || !form || !view) return;

    function toggleEditMode(editing) {
        if (editing) {
            form.style.display = '';
            view.style.display = 'none';
        } else {
            form.style.display = 'none';
            view.style.display = '';
        }
    }

    editBtn.addEventListener('click', function() {
        toggleEditMode(true);
    });

    cancelBtn.addEventListener('click', function() {
        toggleEditMode(false);
    });

    form.addEventListener('submit', function(e) {
        // Validate fields
        let valid = true;
        // Email (optional, but if present must be valid)
        const email = form.email.value.trim();
        if (email && !/^\S+@\S+\.\S+$/.test(email)) {
            valid = false;
            form.email.classList.add('is-invalid');
        } else {
            form.email.classList.remove('is-invalid');
        }
        // Date of Birth (optional, but if present must be valid date)
        const date = form.date.value.trim();
        if (date && isNaN(Date.parse(date))) {
            valid = false;
            form.date.classList.add('is-invalid');
        } else {
            form.date.classList.remove('is-invalid');
        }
        // Firm Join Date (optional, but if present must be valid date)
        const firmJoin = form.firm_join_date.value.trim();
        if (firmJoin && isNaN(Date.parse(firmJoin))) {
            valid = false;
            form.firm_join_date.classList.add('is-invalid');
        } else {
            form.firm_join_date.classList.remove('is-invalid');
        }
        // Firm Weekend Days (optional, but if present must be comma-separated numbers)
        const weekend = form.firm_weekend_days.value.trim();
        if (weekend && !/^\d+(?:\s*,\s*\d+)*$/.test(weekend)) {
            valid = false;
            form.firm_weekend_days.classList.add('is-invalid');
        } else {
            form.firm_weekend_days.classList.remove('is-invalid');
        }
        if (!valid) {
            e.preventDefault();
            return false;
        }
        // Allow form to submit
    });
})();

// Leaves types add rows
document.getElementById('add-row').addEventListener('click', () => {
  const tbody = document.querySelector('#leave-table tbody');
  const lastRow = tbody.lastElementChild;  // or: tbody.querySelector('tr:last-child')
  const row = lastRow.cloneNode(true);
  row.querySelectorAll('input').forEach(i => i.value = '');
  tbody.append(row);
});
document.querySelector('#leave-table').addEventListener('click', e => {
  if (e.target.classList.contains('remove-row')) {
    const rows = document.querySelectorAll('#leave-table tbody tr');
    if (rows.length > 1) e.target.closest('tr').remove();
  }
});

// Import leaves data function
(function () {
  const importBtn = document.getElementById("import-leaves-btn");
  const box = document.getElementById("import-leaves-box");
  const input = document.getElementById("leave-json-input");
  const submit = document.getElementById("submit-leave-json");
  const cancel = document.getElementById("cancel-leave-json");
  const errorBox = document.getElementById("leave-import-error");

  if (!importBtn || !box || !input || !submit || !cancel || !errorBox) return;

  importBtn.addEventListener("click", () => {
    box.style.display = "block";
    errorBox.style.display = "none";
    input.focus();
  });

  cancel.addEventListener("click", () => {
    input.value = "";
    box.style.display = "none";
    errorBox.style.display = "none";
  });

  submit.addEventListener("click", async () => {
    errorBox.style.display = "none";
    errorBox.textContent = "";

    let parsed;
    try {
      parsed = JSON.parse(input.value);
    } catch {
      errorBox.textContent = "Invalid JSON format.";
      errorBox.style.display = "block";
      return;
    }

    try {
      const res = await fetch("/leaves/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaves_taken: parsed })
      });

      const data = await res.json();

      if (!res.ok) {
        errorBox.textContent = data.error || "Import failed.";
        errorBox.style.display = "block";
        return;
      }

      // Optional: show toast/alert
      alert("Leaves data imported successfully.");
      box.style.display = "none";
      input.value = "";
      location.reload(); // or reload part of the UI
    } catch (err) {
      console.error("Fetch error during leave import:", err);
      errorBox.textContent = "Server error. Please try again.";
      errorBox.style.display = "block";
    }
  });
})();
