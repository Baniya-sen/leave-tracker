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
