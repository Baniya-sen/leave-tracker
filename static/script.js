// Register-app-page
(function () {
    const email = document.getElementById('regisEmail');
    const pass = document.getElementById('regisPass');
    const confirmPass = document.getElementById('confirmRegisPass');
    const signupBtn = document.getElementById('passwordSubmit');

    if (!email || !pass || !confirmPass || !signupBtn) {
        return;
    }

    signupBtn.addEventListener('click', function () {
        this.form.submit();
        setTimeout(() => {
          email.disabled = true;
          pass.disabled = true;
          confirmPass.disabled = true;
          signupBtn.disabled = true;
        }, 0);
    })
})();

// Login-app-page
(function () {
    const email = document.getElementById('regisEmail');
    const pass = document.getElementById('regisPass');
    const loginBtn = document.getElementById('login-btn');

    if (!email || !pass || !loginBtn) {
        return;
    }

    loginBtn.addEventListener('click', function () {
        this.form.submit();
        setTimeout(() => {
          email.disabled = true;
          pass.disabled = true;
          loginBtn.disabled = true;
        }, 0);
    })
})();

// Home-page
let currentMonthGlobal;
let updateCalenderGlobal;
let updateLeaveRemainGlobal;
let updateFilterDataGlobal;
let updateMonthlyInfoGlobal;

(function () {
    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    const monthSelect = document.getElementById('month');
    const yearSlider = document.getElementById('yearSlider');
    const daysContainer = document.getElementById('days');

    const monthFilter = document.getElementById('filter-month');
    const monthSummary = document.getElementById('monthly-summary');
    const monthSummaryName = document.getElementById('summary-month-name');

    const monthInfoPanel = document.getElementById('monthly-suggestions');
    if (monthInfoPanel && window.USER_INFO?.account_verified === 1) {
        monthInfoPanel.classList.remove('d-none');
    }

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
        if (window.USER_LEAVES && window.USER_LEAVES.leaves_taken) {
            const taken = window.USER_LEAVES.leaves_taken;
            Object.entries(taken).forEach(([type, dates]) => {
                dates.forEach(dateStr => {
                    if (!leaveMap[dateStr]) leaveMap[dateStr] = [];
                    leaveMap[dateStr].push(type);
                });
            });
        }
        return leaveMap;
    }

    function updateLeaveRemainingDash() {
        const mainDiv = document.querySelector('.card.balance-remaining');
        if (!mainDiv) return;

        const remaining = window.USER_LEAVES?.leaves_remaining;
        if (!remaining) return;

        const listItems = mainDiv.querySelectorAll('li');
        listItems.forEach(li => {
            const labelNode = li.cloneNode(true);
            labelNode.querySelector('.icon')?.remove();
            const labelText = labelNode.textContent.trim().split(':')[0].trim();

            if (remaining[labelText] !== undefined) {
              const valueSpan = li.querySelector('span.value');
              if (valueSpan) {
                valueSpan.textContent = remaining[labelText];
              }
            }
        });
    }

    async function suppyFilterData(index) {
        try {
            const res = await fetch(`/get-monthly-leaves-data/${index + 1}`, {
                method: 'GET',
                credentials: 'include',
            });
            const data = await res.json();
            if (!res.ok) {
                return;
            }

            const monthName = `${monthNames[index]} ${currentYear}`;
            const total = Object.values(data.data).reduce((sum, dates) => sum + dates.length, 0);
            const breakdown = Object.entries(data.data)
              .map(([type, dates]) => `${type}: ${dates.length}`)
              .join(', ');

            const tDays = total === 1 ? 'leave' : 'leaves';

            monthSummary.innerHTML = `
            <h3 id="summary-month-name">${monthName} Summary</h3>
              <ul>
                <li style="justify-content: space-around;">Taken: ${total} ${tDays}<br>(${breakdown})</li>
              </ul>
            `;
        } catch {
            return null
        }
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

        monthSelect.addEventListener('change', (e) => {
            const selectedIndex = e.target.selectedIndex;
            currentMonth = selectedIndex;
            updateCalendar();
            monthFilter.value = currentMonth;
            currentMonthGlobal = currentMonth;
            suppyFilterData(currentMonth);
            updateMonthlyInfo(currentMonth);
        });
        monthSelect.value = currentMonth;

        monthFilter.addEventListener('change', (e) => {
            const selectedIndex = e.target.selectedIndex;
            currentMonthGlobal = currentMonth;
            suppyFilterData(selectedIndex);
        });
        monthFilter.value = currentMonth;
        suppyFilterData(currentMonth);

        document.getElementById('prev').onclick = () => {
            currentMonth--;
            if (currentMonth < 0) {
                currentMonth = 11;
                currentYear--;
            }
            monthSelect.value = currentMonth;
            updateCalendar();
            scrollToYear(currentYear);
            currentMonthGlobal = currentMonth;
            monthFilter.value = currentMonth;
            suppyFilterData(currentMonth);
            updateMonthlyInfo(currentMonth);
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
            currentMonthGlobal = currentMonth;
            monthFilter.value = currentMonth;
            suppyFilterData(currentMonth);
            updateMonthlyInfo(currentMonth);
        };
    }

    function updateCalendar() {
        daysContainer.innerHTML = '';
        const rawFirst = new Date(currentYear, currentMonth, 1).getDay();
        const firstDayIndex = (rawFirst + 6) % 7;
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const leaveMap = buildLeaveMap();
        const weekend = window.USER_INFO?.firm_weekend
        ? window.USER_INFO.firm_weekend
            .split(',')
            .map(s => s.trim())
            .filter(s => s !== '')
            .map(s => {
                const n = Number(s);
                return (n >= 1 && n <= 7) ? n - 1 : 0;
            })
        : [];

        for (let i = 0; i < firstDayIndex; i++) {
            const blank = document.createElement('div');
            blank.classList.add('empty');
            daysContainer.append(blank);
        }
        for (let d = 1; d <= daysInMonth; d++) {
            const cell = document.createElement('div');
            cell.classList.add('calendar-day');
            const num = document.createElement('span');
            num.classList.add('date-number');
            num.style.zIndex = '2';
            num.style.position = 'relative';

            const weekday = (firstDayIndex + (d - 1)) % 7;
            if (weekend.includes(weekday)) {
              cell.classList.add('weekend');
            }
            if (
                d === today.getDate() &&
                currentMonth === today.getMonth() &&
                currentYear === today.getFullYear()
            ) {
                cell.classList.add('today');
            }
            const iso = `${currentYear}-${pad(currentMonth + 1)}-${pad(d)}`;
            cell.dataset.date = iso;
            if (leaveMap[iso]) {
                cell.classList.add('leave-day');
                cell.style.position = 'relative';
                cell.style.overflow = 'hidden';
                cell.style.backgroundColor = 'red';
                cell.style.display = 'flex';
                cell.style.flexDirection = 'column';
                cell.style.justifyContent = 'space-between';
                cell.title = leaveMap[iso].join(', ');
                const labelsContainer = document.createElement('div');
                labelsContainer.classList.add('leave-labels');
                Object.assign(labelsContainer.style, {
                    position: 'absolute',
                    bottom: '2px',
                    left: '2px',
                    right: '2px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    gap: '2px',
                    overflow: 'hidden',
                    maxHeight: '2.5em',
                    background: 'transparent',
                    zIndex: '1'
                });
                leaveMap[iso].forEach(type => {
                    const span = document.createElement('span');
                    span.classList.add('leave-label');
                    span.textContent = type;
                    Object.assign(span.style, {
                      display: 'block',
                      width: '100%',
                      textAlign: 'center',
                      fontSize: 'calc(6px + 1vh)',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                      marginTop: '4%',
                    });
                    labelsContainer.append(span);
                });
                cell.append(labelsContainer);
            }
            num.textContent = d;
            cell.append(num);
            daysContainer.append(cell);
        }
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

    function updateMonthlyInfo(index) {
        const workingLabelSpan = document.getElementById('working-label');
        const workingLeftSpan = document.getElementById('working-left');
        const totalWeekendsSpan = document.getElementById('total-weekends');

        const allDays = Array.from(document.querySelectorAll('#days .calendar-day'));
        const weekendDays = allDays.filter(day => day.classList.contains('weekend'));
        const leaveDays = allDays.filter(day => day.classList.contains('leave-day'));

        let totalDaysCount = allDays.length;
        let weekendCount = weekendDays.length;
        let leaveDayCount = leaveDays.length;
        let workingDays = totalDaysCount - weekendCount - leaveDayCount;
        let label = today.getMonth() > index ? 'Days you have worked for:' : 'Days you will work for:';

        if (today.getMonth() === index) {
            const tillNowWeekendDays = allDays.slice(today.getDate()).filter(day => day.classList.contains('weekend'));
            const tillNowleaveDays = allDays.slice(today.getDate()).filter(day => day.classList.contains('leave-day'));
            workingDays = totalDaysCount - tillNowWeekendDays.length - tillNowleaveDays.length - today.getDate();
            label = 'Working Days Left:';
        }

        workingLabelSpan.textContent = label;
        workingLeftSpan.textContent = workingDays;
        totalWeekendsSpan.textContent = weekendCount;
    }

    populateControls();
    updateCalendar();
    scrollToYear(currentYear);
    updateMonthlyInfo(currentMonth);

    currentMonthGlobal = currentMonth;
    updateCalenderGlobal = updateCalendar;
    updateLeaveRemainGlobal = updateLeaveRemainingDash;
    updateFilterDataGlobal = suppyFilterData;
    updateMonthlyInfoGlobal = updateMonthlyInfo;
})();

// Account page logic (only runs on account.html)
(async function () {
    if (!document.querySelector('.settings-card') || !document.getElementById('tab-account')) return;

    async function fetchUserInfo() {
        const csrf = document.querySelector('meta[name="csrf-token"]').content;
        const res = await fetch('/user-info', {
            method: 'GET',
            credentials: 'include',
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}`);
        }

        return res.json();
    }
    let user_info = await fetchUserInfo();

    // Helper to close all edit modes
    function closeAllEditModes() {
        // Name & Age
        if (nameAgeEditForm && nameAgeDisplay && editNameAgeBtn) {
            nameAgeEditForm.classList.add('d-none');
            nameAgeDisplay.style.display = '';
            editNameAgeBtn.classList.remove('d-none');
            nameInputEdit.value = nameInputEdit.getAttribute('value') || '';
            ageInputEdit.value = ageInputEdit.getAttribute('value') || '';
        }
        // Email
        if (emailEditForm && emailDisplay && editEmailBtn) {
            emailEditForm.classList.add('d-none');
            emailDisplay.style.display = '';
            editEmailBtn.classList.remove('d-none');
            emailInputEdit.value = emailInputEdit.getAttribute('value') || '';
        }
        // DOB
        if (dobEditForm && dobDisplay && editDobBtn) {
            dobEditForm.classList.add('d-none');
            dobDisplay.style.display = '';
            editDobBtn.classList.remove('d-none');
            dobInputEdit.value = dobInputEdit.getAttribute('value') || '';
        }
    }

    // Tab switching
    const tabs = document.querySelectorAll('.settings-tab');
    const panels = document.querySelectorAll('.settings-tab-panel');

    function activateTab(tabName) {
        tabs.forEach(t => t.classList.remove('active'));
        panels.forEach(p => p.classList.add('d-none'));
        tabName.classList.add('active');
        document.getElementById('tab-' + tabName.dataset.tab).classList.remove('d-none');
        if (tabName.dataset.tab == '#account') {
            closeAllEditModes();
        }
        window.location.hash = tabName.dataset.tab;
    }
    const name = (window.location.hash || '#account').substring(1);
    const targetTabName = document.querySelector(`.settings-tab[data-tab="${name}"]`);
    activateTab(targetTabName);
    tabs.forEach(tab => {
        tab.addEventListener('click', function () {
            activateTab(this);
        });
    });

    // Inline editing for name & age (merged)
    const editNameAgeBtn = document.getElementById('edit-name-age');
    const nameAgeDisplay = document.getElementById('name-age-display');
    const nameAgeEditForm = document.getElementById('name-age-edit-form');
    const cancelNameAgeBtn = document.getElementById('cancel-name-age');
    const nameInputEdit = document.getElementById('name-input-edit');
    const ageInputEdit = document.getElementById('age-input-edit');
    const upperDeck = document.getElementById('upper-deck');
    const agePopup = document.createElement('div');
    ageInputEdit.parentElement.style.position = 'relative';
    agePopup.className = 'age-popup';
    upperDeck.appendChild(agePopup);

    let popupTimeoutId = null;

    function emailVerification(dob = false) {
        const email = user_info['email'] ?? '';
        const verified = user_info['account_verified'] ?? '';

        if (!email.trim() || email.trim() === "None") {
            agePopup.innerText = 'You must add a email first.';
            agePopup.classList.add('active');
            closeAllEditModes();

            if (popupTimeoutId) {
                clearTimeout(popupTimeoutId);
                popupTimeoutId = null;
            }
            popupTimeoutId = setTimeout(() => {
                agePopup.classList.remove('active');
                popupTimeoutId = null;
            }, 2500);

            return false;

        } else if (dob && (!verified || verified === 0)) {
            closeAllEditModes();
            agePopup.innerText = 'You must verify your email first.';
            agePopup.classList.add('active');

            if (popupTimeoutId) {
                clearTimeout(popupTimeoutId);
                popupTimeoutId = null;
            }
            popupTimeoutId = setTimeout(() => {
                agePopup.classList.remove('active');
                popupTimeoutId = null;
            }, 2500);

            return false;
        }

        return true;
    }

    if (editNameAgeBtn && nameAgeDisplay && nameAgeEditForm && cancelNameAgeBtn && nameInputEdit && ageInputEdit) {
        agePopup.innerText = 'Age must be valid, at least 14.';

        function validateAgePopup() {
            const age = ageInputEdit.value;
            if (age === '') {
                agePopup.classList.remove('active');
                return
            }
            const val = parseInt(age, 10);
            if (val < 14) {
                agePopup.classList.add('active');
            } else {
                agePopup.classList.remove('active');
            }
        }
        ageInputEdit.addEventListener('input', validateAgePopup);
        editNameAgeBtn.addEventListener('click', function (e) {
            if (!emailVerification(true)) {
                e.preventDefault();
                return
            }
            closeAllEditModes();
            nameAgeDisplay.style.display = 'none';
            nameAgeEditForm.classList.remove('d-none');
            editNameAgeBtn.classList.add('d-none');
            nameInputEdit.focus();
            setTimeout(validateAgePopup, 10);
        });
        cancelNameAgeBtn.addEventListener('click', function () {
            nameAgeEditForm.classList.add('d-none');
            nameAgeDisplay.style.display = '';
            editNameAgeBtn.classList.remove('d-none');
            nameInputEdit.value = nameInputEdit.getAttribute('value') || '';
            ageInputEdit.value = ageInputEdit.getAttribute('value') || '';
            agePopup.classList.remove('active');
        });
    }

    // Inline editing for email
    const editEmailBtn = document.getElementById('edit-email');
    const emailDisplay = document.getElementById('email-display');
    const emailEditForm = document.getElementById('email-edit-form');
    const cancelEmailBtn = document.getElementById('cancel-email');
    const emailInputEdit = document.getElementById('email-input-edit');
    if (editEmailBtn && emailDisplay && emailEditForm && cancelEmailBtn && emailInputEdit) {
        editEmailBtn.addEventListener('click', function () {
            closeAllEditModes();
            emailDisplay.style.display = 'none';
            emailEditForm.classList.remove('d-none');
            editEmailBtn.classList.add('d-none');
            emailInputEdit.focus();
        });
        cancelEmailBtn.addEventListener('click', function () {
            emailEditForm.classList.add('d-none');
            emailDisplay.style.display = '';
            editEmailBtn.classList.remove('d-none');
            emailInputEdit.value = emailInputEdit.getAttribute('value') || '';
        });
    }

    // Inline editing for date of birth
    const editDobBtn = document.getElementById('edit-dob');
    const dobDisplay = document.getElementById('dob-display');
    const dobEditForm = document.getElementById('dob-edit-form');
    const cancelDobBtn = document.getElementById('cancel-dob');
    const dobInputEdit = document.getElementById('dob-input-edit');
    if (editDobBtn && dobDisplay && dobEditForm && cancelDobBtn && dobInputEdit) {
        editDobBtn.addEventListener('click', function (e) {
            if (!emailVerification(true)) {
                e.preventDefault();
                return
            }
            closeAllEditModes();
            dobDisplay.style.display = 'none';
            dobEditForm.classList.remove('d-none');
            editDobBtn.classList.add('d-none');
            dobInputEdit.focus();
        });
        cancelDobBtn.addEventListener('click', function () {
            dobEditForm.classList.add('d-none');
            dobDisplay.style.display = '';
            editDobBtn.classList.remove('d-none');
            dobInputEdit.value = dobInputEdit.getAttribute('value') || '';
        });
    }

    const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');
    const verifyDiv = document.getElementById("verifyDiv");
    const verifyBtn = document.getElementById("verify-account-btn");
    if (verifyBtn) {
        verifyBtn.addEventListener("click", async () => {
            if (!emailVerification()) {
                return
            }
            verifyBtn.disabled = true;
            verifyBtn.textContent = "Wait!";

            try {
                const response = await fetch('/request-verify-email', {
                    method: 'POST',
                    headers: { 'X-CSRFToken': csrfToken }
                });

                let data;
                const contentType = response.headers.get("Content-Type") || "";
                if (contentType.includes("application/json")) {
                    data = await response.json();
                } else {
                    data = { error: await response.text() };
                }

                if (response.ok) {
                    verifyBtn.classList.add("d-none");
                    verifyDiv.classList.add("justify-content-between");
                    document.getElementById("account-status").classList.add("d-none");
                    document.getElementById("otp-input-container").classList.remove("d-none");
                    document.getElementById("otp-input").focus();
                } else {
                    console.error("Server error:", response.status, data.error);
                    alert(data.error || "Failed to send verification email. Try again later.");
                    verifyBtn.disabled = false;
                    verifyBtn.textContent = "Verify";
                }
            } catch (err) {
                console.error("Fetch error:", err);
                alert("Error sending request.");
            }
        });
    }

    const cancelVerifyBtn = document.getElementById("cancel-otp-btn");
    if (cancelVerifyBtn) {
        cancelVerifyBtn.addEventListener("click", () => {
            verifyBtn.disabled = false;
            verifyBtn.textContent = "Verify";
            verifyDiv.classList.remove("justify-content-between");
            document.getElementById("account-status").classList.remove("d-none");
            document.getElementById("otp-input").value = "";
            document.getElementById("otp-input-container").classList.add("d-none");
            document.getElementById("verify-account-btn").classList.remove("d-none");
        });
    }

    const saveOTPBtn = document.getElementById("save-otp-btn");
    if (saveOTPBtn) {
        saveOTPBtn.addEventListener("click", async () => {
            const otp = document.getElementById("otp-input").value.trim();
            if (!/^\d{6}$/.test(otp)) {
                alert("OTP must be 6 digits");
                return;
            }
            try {
                const response = await fetch("/confirm-otp", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        'X-CSRFToken': csrfToken
                    },
                    body: JSON.stringify({ otp })
                });
                if (response.ok) {
                    user_info = await fetchUserInfo();
                    verifyDiv.classList.remove("justify-content-between");
                    document.getElementById("account-status").textContent = "VERIFIED";
                    document.getElementById("account-status").classList.remove("d-none");
                    document.getElementById("account-status").classList.remove("account-badge-unverified");
                    document.getElementById("account-status").classList.add("account-badge-verified");
                    document.getElementById("otp-input-container").classList.add("d-none");
                } else {
                    alert("Invalid OTP");
                }
            } catch (error) {
                console.error(error);
                alert("Error verifying OTP.");
            }
        });
    }

    // Inline editing for firm info (like name & age)
    const editFirmInfoBtn = document.getElementById('edit-firm-info');
    const firmInfoDisplay = document.getElementById('firm-info-display');
    const firmInfoEditForm = document.getElementById('firm-info-edit-form');
    const cancelFirmInfoBtn = document.getElementById('cancel-firm-info');
    const firmNameInputEdit = document.querySelector('input[name="firm_name"]');
    const firmJoinDateInputEdit = document.querySelector('input[name="firm_join_date"]');
    if (editFirmInfoBtn && firmInfoDisplay && firmInfoEditForm && cancelFirmInfoBtn && firmNameInputEdit && firmJoinDateInputEdit) {
        editFirmInfoBtn.addEventListener('click', function (e) {
            if (!emailVerification(true)) {
                e.preventDefault();
                return
            }
            closeAllEditModes();
            firmInfoDisplay.style.display = 'none';
            firmInfoEditForm.classList.remove('d-none');
            editFirmInfoBtn.classList.add('d-none');
            firmNameInputEdit.focus();
        });
        cancelFirmInfoBtn.addEventListener('click', function () {
            firmInfoEditForm.classList.add('d-none');
            firmInfoDisplay.style.display = '';
            editFirmInfoBtn.classList.remove('d-none');
            firmNameInputEdit.value = firmNameInputEdit.getAttribute('value') || '';
            firmJoinDateInputEdit.value = firmJoinDateInputEdit.getAttribute('value') || '';
        });
    }

    // Inline editing for firm weekend days
    const editFirmWeekendBtn = document.getElementById('edit-firm-weekend');
    const firmWeekendDisplay = document.getElementById('firm-weekend-display');
    const firmWeekendEditForm = document.getElementById('firm-weekend-edit-form');
    const cancelFirmWeekendBtn = document.getElementById('cancel-firm-weekend');
    const firmWeekendInputEdit = document.querySelector('input[name="firm_weekend_days"]');
    if (editFirmWeekendBtn && firmWeekendDisplay && firmWeekendEditForm && cancelFirmWeekendBtn && firmWeekendInputEdit) {
        editFirmWeekendBtn.addEventListener('click', function (e) {
            if (!emailVerification(true)) {
                e.preventDefault();
                return
            }
            closeAllEditModes();
            firmWeekendDisplay.style.display = 'none';
            firmWeekendEditForm.classList.remove('d-none');
            editFirmWeekendBtn.classList.add('d-none');
            firmWeekendInputEdit.focus();
        });
        cancelFirmWeekendBtn.addEventListener('click', function () {
            firmWeekendEditForm.classList.add('d-none');
            firmWeekendDisplay.style.display = '';
            editFirmWeekendBtn.classList.remove('d-none');
            firmWeekendInputEdit.value = firmWeekendInputEdit.getAttribute('value') || '';
        });
    }

    // Inline editing for firm leaves structure (match HTML)
    const editFirmLeavesBtn = document.getElementById('edit-firm-leaves');
    const firmLeavesContainer = document.querySelector('.leaves-grid');
    const firmLeavesDisplay = document.querySelector('.leaves-items');
    const firmLeavesEditForm = document.getElementById('firm-leaves-edit-form');
    const cancelFirmLeavesBtn = document.getElementById('cancel-firm-leaves');
    const addLeaveTypeBtn = document.getElementById('add-leave-type');
    if (editFirmLeavesBtn && firmLeavesDisplay && firmLeavesEditForm && cancelFirmLeavesBtn && addLeaveTypeBtn) {
        editFirmLeavesBtn.addEventListener('click', function (e) {
            if (!emailVerification(true)) {
                e.preventDefault();
                return
            }
            closeAllEditModes();
            firmLeavesDisplay.style.display = 'none';
            firmLeavesEditForm.classList.remove('d-none');
            editFirmLeavesBtn.classList.add('d-none');
        });
        cancelFirmLeavesBtn.addEventListener('click', function () {
            firmLeavesEditForm.classList.add('d-none');
            firmLeavesDisplay.style.display = '';
            editFirmLeavesBtn.classList.remove('d-none');
        });
        addLeaveTypeBtn.addEventListener('click', function () {
            const form = firmLeavesEditForm;
            const newSet = document.createElement('div');
            newSet.className = 'd-flex align-items-center gap-2 leave-input-set';
            newSet.innerHTML = `
                <input type="text" class="form-control" name="leave_type[]" placeholder="Leave type" style="width:120px;">
                <input type="number" class="form-control" name="leave_count[]" placeholder="Number" style="width:80px;">
                <button type="button" class="btn btn-danger btn-sm remove-leave-type">&times;</button>
            `;
            // Insert before the Add button
            form.querySelector('#firm-leaves-inputs').appendChild(newSet);
        });
        firmLeavesEditForm.addEventListener('click', function (e) {
            if (e.target.classList.contains('remove-leave-type')) {
                e.preventDefault();
                const set = e.target.closest('.leave-input-set');
                if (set) set.remove();
            }
        });
    }
})();

function setFormDisabled(form, disabled) {
  form.querySelectorAll('input, button, select, textarea')
      .forEach(el => el.disabled = disabled);
}

const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');

;(function() {
  const form    = document.getElementById('name-age-edit-form');
  const display = document.getElementById('name-age-display');
  const btn     = document.getElementById('edit-name-age');

  if (form) {
    form.addEventListener('submit', async e => {
        e.preventDefault();
        try {
          const res = await fetch(form.action, {
            method: 'POST',
            headers: { 'X-CSRFToken': csrfToken },
            body:    new FormData(form),
            credentials: 'include'
          });
          setFormDisabled(form, true);
          const payload = await res.json();
          if (payload.status === 'ok') {
            const [nameEl, ageEl] = display.querySelectorAll('b');
            nameEl.textContent    = payload.data.name;
            ageEl.textContent     = payload.data.age;
            form.classList.add('d-none');
            display.style.display = '';
            btn.classList.remove('d-none');
          } else {
            alert(payload.error);
          }
        } catch (err) {
          alert('Server error—please try again.');
        } finally {
          setFormDisabled(form, false);
        }
      });
  }
})();

// ===== Email =====
;(function() {
  const form    = document.getElementById('email-edit-form');
  const display = document.getElementById('email-display');
  const btn     = document.getElementById('edit-email');

  if (form) {
    form.addEventListener('submit', async e => {
        e.preventDefault();
        try {
          const res     = await fetch(form.action, {
            method: 'POST',
            headers: { 'X-CSRFToken': csrfToken },
            body:    new FormData(form),
            credentials: 'include'
          });
          setFormDisabled(form, true);
          const payload = await res.json();
          if (payload.status === 'ok') {
            display.querySelector('b').textContent = payload.data.email;
            form.classList.add('d-none');
            display.style.display = '';
            btn.classList.remove('d-none');
          } else {
            alert(payload.error);
          }
        } catch {
          alert('Server error—please try again.');
        } finally {
          setFormDisabled(form, false);
        }
      });
  }
})();

// ===== Date of Birth =====
;(function() {
  const form = document.getElementById('dob-edit-form');
  const display = document.getElementById('dob-display');
  const btn = document.getElementById('edit-dob');

  if (form) {
    form.addEventListener('submit', async e => {
        e.preventDefault();
        try {
          const res = await fetch(form.action, {
            method: 'POST',
            headers: { 'X-CSRFToken': csrfToken },
            body:    new FormData(form),
            credentials: 'include'
          });
          setFormDisabled(form, true);
          const payload = await res.json();
          if (payload.status === 'ok') {
            display.querySelector('b').textContent = payload.data.date;
            form.classList.add('d-none');
            display.style.display = '';
            btn.classList.remove('d-none');
          } else {
            alert(payload.error);
          }
        } catch {
          alert('Server error—please try again.');
        } finally {
          setFormDisabled(form, false);
        }
      });
  }
})();

// ===== Firm Info =====
;(function() {
  const form    = document.getElementById('firm-info-edit-form');
  const display = document.getElementById('firm-info-display');
  const btn     = document.getElementById('edit-firm-info');

  if (form) {
    form.addEventListener('submit', async e => {
        e.preventDefault();
        try {
          const res     = await fetch(form.action, {
            method: 'POST',
            headers: { 'X-CSRFToken': csrfToken },
            body:    new FormData(form),
            credentials: 'include'
          });
          setFormDisabled(form, true);
          const payload = await res.json();
          if (payload.status === 'ok') {
            const [nameEl, dateEl] = display.querySelectorAll('b');
            nameEl.textContent     = payload.data.firm_name;
            dateEl.textContent     = payload.data.firm_join_date;
            form.classList.add('d-none');
            display.style.display = '';
            btn.classList.remove('d-none');
          } else {
            alert(payload.error);
          }
        } catch {
          alert('Server error—please try again.');
        } finally {
          setFormDisabled(form, false);
        }
      });
  }
})();

// ===== Firm Weekend Days =====
;(function() {
  const form    = document.getElementById('firm-weekend-edit-form');
  const display = document.getElementById('firm-weekend-display');
  const btn     = document.getElementById('edit-firm-weekend');
  const weekdayMap = {
    '1': 'Monday',
    '2': 'Tuesday',
    '3': 'Wednesday',
    '4': 'Thursday',
    '5': 'Friday',
    '6': 'Saturday',
    '7': 'Sunday',
  };

  if (form) {
    form.addEventListener('submit', async e => {
        e.preventDefault();
        try {
          const res     = await fetch(form.action, {
            method: 'POST',
            headers: { 'X-CSRFToken': csrfToken },
            body:    new FormData(form),
            credentials: 'include'
          });
          setFormDisabled(form, true);
          const payload = await res.json();
          if (payload.status === 'ok') {
            const weekend_days = display.querySelectorAll('span');

            const raw = payload.data.firm_weekend_days || '';
            const parts = raw
              .split(',')
              .map(s => s.trim())
              .filter(s => s in weekdayMap)
              .map(n => `${n}: ${weekdayMap[n]}`);
            display.innerHTML = parts
              .map(p => `<span>${p}</span>`)
              .join('');

            form.classList.add('d-none');
            display.style.display = '';
            btn.classList.remove('d-none');
          } else {
            alert(payload.error);
          }
        } catch (err) {
          alert('Server error—please try again.');
        } finally {
          setFormDisabled(form, false);
        }
      });
  }
})();

// User leaves structure
;(function() {
  const form    = document.getElementById('firm-leaves-edit-form');
  const display = document.getElementById('leaves-items');
  const btn     = document.getElementById('edit-firm-leaves');

  if (form) {
    form.addEventListener('submit', async e => {
        e.preventDefault();
        try {
          const res     = await fetch(form.action, {
            method: 'POST',
            headers: { 'X-CSRFToken': csrfToken },
            body:    new FormData(form),
            credentials: 'include'
          });
          setFormDisabled(form, true);
          const payload = await res.json();
          if (payload.status === 'ok') {
            location.reload();
            return;
          } else {
            alert(payload.error);
          }
        } catch (err) {
          alert('Server error—please try again.');
        } finally {
          setFormDisabled(form, false);
        }
      });
  }
})();


// Leaves types add rows
const addRow = document.getElementById('add-row');
if (addRow) {
    addRow.addEventListener('click', () => {
        const tbody = document.querySelector('#leave-table tbody');
        const lastRow = tbody.lastElementChild;
        const row = lastRow.cloneNode(true);
        row.querySelectorAll('input').forEach(i => i.value = '');
        tbody.append(row);
    });
}
const leaveTable = document.querySelector('#leave-table');
if (leaveTable) {
    leaveTable.addEventListener('click', e => {
        if (e.target.classList.contains('remove-row')) {
            const rows = document.querySelectorAll('#leave-table tbody tr');
            if (rows.length > 1) e.target.closest('tr').remove();
        }
    });
}

// Import leaves data function
(function () {
    const importBtn = document.getElementById("submit-leave-json");
    const text = document.getElementById("import-leaves-data-json");
    const errorBox = document.getElementById("leave-import-error");

    if (!importBtn || !text || !errorBox) return;

    importBtn.addEventListener("click", async () => {
        importBtn.disabled = true;
        text.disabled = true;
        errorBox.style.display = "none";
        errorBox.textContent = "";

        if (text.value === "") {
            errorBox.textContent = "No data provided.";
            errorBox.style.display = "block";
            importBtn.disabled = false;
            text.disabled = false;
            return;
        }

        let parsed;
        try {
            parsed = JSON.parse(text.value);
        } catch {
            errorBox.textContent = "Invalid JSON format.";
            errorBox.style.display = "block";
            importBtn.disabled = false;
            text.disabled = false;
            return;
        }

        try {
            const csrf = document.querySelector('meta[name="csrf-token"]').content;
            const res = await fetch("/leaves/import", {
                method: "POST",
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrf
                },
                body: JSON.stringify({ leaves_taken: parsed })
            });

            const data = await res.json();

            if (!res.ok) {
                errorBox.textContent = data.error || "Import failed.";
                errorBox.style.display = "block";
                return;
            }

            // Optional: show toast/alert
            errorBox.textContent = "Leaves data imported successfully.";
            errorBox.style.display = "block";
            text.value = "";
            location.reload();
        } catch (err) {
            errorBox.textContent = "Server error. Please try again after few minutes.";
            errorBox.style.display = "block";
        }
    });
})();

document.addEventListener('DOMContentLoaded', function () {
    // Name & Age validation
    const nameAgeForm = document.getElementById('name-age-edit-form');
    if (nameAgeForm) {
        nameAgeForm.addEventListener('submit', function (e) {
            const age = nameAgeForm.age.value.trim();
            if (age && (!/^[0-9]+$/.test(age) || parseInt(age) < 14)) {
                alert('Age must be a number and at least 14.');
                e.preventDefault();
            }
        });
    }

    // Email validation
    const emailForm = document.getElementById('email-edit-form');
    if (emailForm) {
        emailForm.addEventListener('submit', function (e) {
            const email = emailForm.email.value.trim();
            if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
                alert('Please enter a valid email address.');
                e.preventDefault();
            }
        });
    }

    // Firm Name validation (not just numbers)
    const firmInfoForm = document.getElementById('firm-info-edit-form');
    if (firmInfoForm) {
        firmInfoForm.addEventListener('submit', function (e) {
            const firmName = firmInfoForm.firm_name.value.trim();
            if (firmName && /^[0-9]+$/.test(firmName)) {
                alert('Firm name cannot be just numbers.');
                e.preventDefault();
            }
        });
    }

    // Firm Leaves Structure validation (at least one type/count, all counts >= 0)
    const firmLeavesForm = document.getElementById('firm-leaves-edit-form');
    if (firmLeavesForm) {
        firmLeavesForm.addEventListener('submit', function (e) {
            const types = Array.from(firmLeavesForm.querySelectorAll('input[name="leave_type[]"]')).map(i => i.value.trim());
            const counts = Array.from(firmLeavesForm.querySelectorAll('input[name="leave_count[]"]')).map(i => i.value.trim());
            if (!types.length || !counts.length || types.length !== counts.length) {
                alert('Leave types/counts mismatch.');
                e.preventDefault();
                return;
            }
            for (let i = 0; i < types.length; i++) {
                if (!types[i]) {
                    alert('Leave type required.');
                    e.preventDefault();
                    return;
                }
                if (!/^[0-9]+$/.test(counts[i]) || parseInt(counts[i]) < 0) {
                    alert('Leave count must be a non-negative integer.');
                    e.preventDefault();
                    return;
                }
            }
        });
    }
});

(function () {
    // Only run on index.html (calendar page)
    if (!document.getElementById('days')) return;

    // --- Modal Elements ---
    const leaveModal = document.getElementById('leaveModal');
    const leaveTypeSelect = document.getElementById('leaveType');
    const leaveCountInput = document.getElementById('leaveCount');
    const leaveDateInput = document.getElementById('leaveDate');
    const leaveForm = document.getElementById('leaveForm');
    const saveBtn = document.getElementById('saveLeaveBtn');
    const closeBtn = document.getElementById('closeLeaveModal');
    const cancelBtn = document.getElementById('cancelLeaveBtn');

    function showLeaveModal() {
        leaveModal.style.display = 'flex';
    }
    function hideLeaveModal() {
        leaveModal.style.display = 'none';
    }
    closeBtn?.addEventListener('click', () => {
        hideLeaveModal();
        let removeBtn = document.getElementById('removeLeaveBtn');
        removeBtn?.classList.add('d-none');
    });
    cancelBtn?.addEventListener('click', function (e) { e.preventDefault(); hideLeaveModal(); });

    // --- Helper: Populate leave types ---
    function populateLeaveTypes() {
        leaveTypeSelect.innerHTML = '';
        const leavesGiven = window.USER_LEAVES?.leaves_given || {};
        const leavesRemaining = window.USER_LEAVES?.leaves_remaining || {};
        Object.keys(leavesGiven).forEach(type => {
            const rem = leavesRemaining[type] ?? leavesGiven[type];
            const opt = document.createElement('option');
            opt.value = type;
            opt.textContent = `${type} (${rem} left)`;
            opt.dataset.remaining = rem;
            leaveTypeSelect.appendChild(opt);
        });
    }

    // --- Helper: Validate input ---
    function validateLeaveInput() {
        const selected = leaveTypeSelect.options[leaveTypeSelect.selectedIndex];
        const max = parseInt(selected?.dataset.remaining || '0', 10);
        const val = parseInt(leaveCountInput.value, 10);
        if (!selected || isNaN(val) || val < 1 || val > max) {
            leaveCountInput.classList.add('is-invalid');
            saveBtn.disabled = true;
            return false;
        }
        leaveCountInput.classList.remove('is-invalid');
        saveBtn.disabled = false;
        return true;
    }

    // --- Open modal on date click ---
    document.getElementById('days').addEventListener('click', function (e) {
        let cell = e.target;
        while (cell && !cell.classList.contains('calendar-day') && cell !== this) {
            cell = cell.parentElement;
        }
        if (!cell || !cell.classList.contains('calendar-day')) return;
        const iso = cell.dataset.date;
        if (!iso) return;
        const leaveMap = buildLeaveMap();
        if (cell.classList.contains('leave-day')) {
            const leaveType = leaveMap[iso] ? leaveMap[iso][0] : '';
            showLeaveInfoModal(iso, leaveType);
            return;
        }
        // Show add-leave modal
        showAddLeaveModal();
        // Check user info
        const info = window.USER_INFO || {};
        let message = '';
        if (!info.email || info.email === 'None') {
            message = 'Email not added and verified. Go to Account tab → User Settings to add and verify your email.';
        } else if (!info.account_verified || info.account_verified === 0 || info.account_verified === '0') {
            message = 'Email not verified. Go to Account tab → User Settings and verify your email to continue.';
        } else if (!info.firm_name || info.firm_name === 'None') {
            message = 'Firm details missing. Go to Account tab → Firm Settings and add your all firm related information.';
        } else if (!info.leaves_type || Object.keys(info.leaves_type).length === 0) {
            message = 'Leaves types not set. Go to Account tab → Firm Settings and set up your leaves structure.';
        }
        if (message) {
            document.querySelector('.custom-leave-modal-title').textContent = 'Cannot Add Leaves';
            document.getElementById('leaveForm').style.display = 'none';
            let msgDiv = document.getElementById('leaveModalMsg');
            if (!msgDiv) {
                msgDiv = document.createElement('div');
                msgDiv.id = 'leaveModalMsg';
                msgDiv.style.margin = '2em 0';
                msgDiv.style.fontSize = '1.1em';
                msgDiv.style.color = '#b00';
                document.querySelector('.custom-leave-modal-content').appendChild(msgDiv);
            }
            msgDiv.textContent = message;
            let okBtn = document.getElementById('leaveModalOkBtn');
            if (!okBtn) {
                okBtn = document.createElement('button');
                okBtn.id = 'leaveModalOkBtn';
                okBtn.type = 'button';
                okBtn.textContent = 'OK';
                okBtn.className = 'btn btn-primary';
                okBtn.style.margin = '1em auto 0 auto';
                okBtn.style.display = 'block';
                okBtn.onclick = hideLeaveModal;
                document.querySelector('.custom-leave-modal-content').appendChild(okBtn);
            } else {
                okBtn.style.display = 'block';
            }
            showLeaveModal();
            return;
        } else {
            let msgDiv = document.getElementById('leaveModalMsg');
            if (msgDiv) msgDiv.textContent = '';
            let okBtn = document.getElementById('leaveModalOkBtn');
            if (okBtn) okBtn.style.display = 'none';
        }
        leaveDateInput.value = iso;
        populateLeaveTypes();
        leaveCountInput.value = 1;
        validateLeaveInput();
        showLeaveModal();
    });

    // --- Validate on change ---
    leaveTypeSelect?.addEventListener('change', validateLeaveInput);
    leaveCountInput?.addEventListener('input', validateLeaveInput);

    function buildLeaveMap() {
        const leaveMap = {};
        if (window.USER_LEAVES && window.USER_LEAVES.leaves_taken) {
            const taken = window.USER_LEAVES.leaves_taken;
            Object.entries(taken).forEach(([type, dates]) => {
                dates.forEach(dateStr => {
                    if (!leaveMap[dateStr]) leaveMap[dateStr] = [];
                    leaveMap[dateStr].push(type);
                });
            });
        }
        return leaveMap;
    }

    async function updateLeaves(data) {
        const res = await fetch('/user-leaves-info', {
            method: 'GET',
            credentials: 'include',
        });
        const updated = await res.json();
        window.USER_LEAVES.leaves_taken = updated.leaves_taken
        window.USER_LEAVES.leaves_remaining = updated.leaves_remaining
        populateLeaveTypes();
        updateCalenderGlobal?.();
        updateLeaveRemainGlobal?.();
        updateFilterDataGlobal?.(currentMonthGlobal ?? 0);
        updateMonthlyInfoGlobal?.(currentMonthGlobal ?? 0);
    }

    // --- Submit leave form via AJAX ---
    leaveForm?.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!validateLeaveInput()) return;
        saveBtn.disabled = true;

        // Calculate consecutive dates
        const startDate = leaveDateInput.value;
        const days = parseInt(leaveCountInput.value, 10);
        const selectedType = leaveTypeSelect.value;
        const leaveMap = buildLeaveMap();
        let dates = [];
        let d = new Date(startDate);
        while (dates.length < days) {
            const iso = d.toISOString().slice(0, 10);
            if (!leaveMap[iso]) {
                dates.push(iso);
            }
            d.setDate(d.getDate() + 1);
        }

        fetch('/take_leave', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': document.querySelector('meta[name="csrf-token"]').content
            },
            body: JSON.stringify({
                dates: dates,
                type: selectedType
            })
        })
        .then(r => r.json())
        .then(data => {
            if (data.status === 'ok') {
                updateLeaves(data);
                hideLeaveModal();
            } else {
                alert(data.error || 'Failed to take leave');
            }
        })
        .catch(() => alert('Failed to take leave'))
        .finally(() => { saveBtn.disabled = false; });
    });

    // Add leave info modal logic
    function showLeaveInfoModal(date, leaveType) {
        const modal = document.getElementById('leaveModal');
        document.querySelector('.custom-leave-modal-title').textContent = 'Leave Details';
        document.getElementById('leaveForm').style.display = 'none';
        let infoDiv = document.getElementById('leaveInfoDiv');
        if (!infoDiv) {
            infoDiv = document.createElement('div');
            infoDiv.id = 'leaveInfoDiv';
            infoDiv.style.margin = '2em 0';
            infoDiv.style.fontSize = '1.1em';
            document.querySelector('.custom-leave-modal-content').appendChild(infoDiv);
        }
        infoDiv.innerHTML = `<b>Date:</b> ${date}<br><b>Leave Type:</b> ${leaveType}`;
        infoDiv.style.display = 'block';
        let removeBtn = document.getElementById('removeLeaveBtn');
        if (!removeBtn) {
            removeBtn = document.createElement('button');
            removeBtn.id = 'removeLeaveBtn';
            removeBtn.type = 'button';
            removeBtn.textContent = 'Remove Leave';
            removeBtn.className = 'btn btn-danger w-50 d-block mx-auto';
            removeBtn.style = 'margin-top: 7%;';
            document.querySelector('.custom-leave-modal-content').appendChild(removeBtn);
        }
        removeBtn.style.display = 'inline-block';
        removeBtn.classList.remove("d-none");
        removeBtn.onclick = function () {
            removeBtn.disabled = true;
            fetch('/remove_leave', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': document.querySelector('meta[name="csrf-token"]').content
                },
                body: JSON.stringify({ date: date, type: leaveType })
            })
            .then(r => r.json())
            .then(data => {
                if (data.status === 'ok') {
                    updateLeaves(data);
                    hideLeaveModal();
                } else {
                    alert(data.error || 'Server did not send a valid data for leave removable!');
                }
            })
            .catch(err => {
              const message = err && err.message
                ? err.message
                : String(err);
              alert(`❌ Failed to remove the leave!`);
              console.error('Remove‑leave failed:', err);
            })
            .finally(() => {
                removeBtn.disabled = false;
            });
            removeBtn.classList.add('d-none');
        };

        let cancelBtn = document.getElementById('cancelLeaveBtn');
        if (cancelBtn) {
            cancelBtn.style.display = 'inline-block';
            cancelBtn.onclick = hideLeaveModal;
        }
        showLeaveModal();
    }

    // When showing the add-leave form, hide info div and Remove button
    function showAddLeaveModal() {
        document.querySelector('.custom-leave-modal-title').textContent = 'Take Leave';
        document.getElementById('leaveForm').style.display = '';
        let infoDiv = document.getElementById('leaveInfoDiv');
        if (infoDiv) infoDiv.style.display = 'none';
        let removeBtn = document.getElementById('removeLeaveBtn');
        if (removeBtn) removeBtn.style.display = 'none';
        let cancelBtn = document.getElementById('cancelLeaveBtn');
        if (cancelBtn) cancelBtn.style.display = 'inline-block';
    }
})();


const promptText = `You are an expert in structuring data. Your task is to convert my raw leave data into a specific JSON format.
I will provide my leave data in any form (e.g., JSON, spreadsheet text, plain text lists, CSV, etc.).

You will then produce a **single JSON object** where:
- **Keys** are leave types (e.g., "Earned", "Sick").
- **Values** are lists of leave dates in \`YYYY-MM-DD\` format.

Example output:
{"Earned": ["2025-07-01", "2025-03-12"], "Sick": ["2025-06-20"]}

⚠️ If you find any **conflicts** (e.g., the same date listed under multiple leave types), you must ask me for clarification before generating the final output.

Guidelines to follow:
- JSON keys must be **clean leave type names**, like "Earned", "Sick", "Casual", "Restricted Holidays", or "Optional".
- **Remove extra words** such as "Leave", "(Festival)", or descriptions from the leave type name. Example: "Optional (Festival)" ➔ "Optional".
- Easily identified same leaves type can be combined.
- Dates must be in **YYYY-MM-DD** format.
- If a **single date appears under multiple leave types**, ask me to clarify before creating the final JSON.
- ❌ Do not explain anything. Do not give additional examples. Do not describe your process.
- Output should be formatted JSON, even better in editor if available.

Please ask me to share any leave data I may have saved to track my leaves in my firm.`;

const copyElements = document.querySelectorAll(".ai-bot-copy");
copyElements.forEach(el => {
    el.addEventListener("click", async function () {
        try {
            // Modern clipboard API with fallback
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(promptText);
            } else {
                const textArea = document.createElement("textarea");
                textArea.value = promptText;
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
            }

            // Show confirmation message near the clicked element
            showCopiedMessage(el.parentElement);
        } catch (err) {
            alert("Failed to copy prompt. Please copy manually:\n" + promptText);
        }
    });
});

function showCopiedMessage(container) {
    let msg = document.createElement("p");
    msg.className = "small mb-0 ms-2 pt-0 inter";
    msg.style.color = "#27d289";
    msg.textContent = "Prompt copied!";
    container.appendChild(msg);

    setTimeout(() => {
        msg.remove();
    }, 2500);
}


// Admin-Login
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
        const user = document.getElementById('username').value.trim();
        const pass = document.getElementById('password').value.trim();
        const errorEl = document.getElementById('error');
        errorEl.style.display = 'none';

        if (!user || !pass) {
            errorEl.textContent = 'Please enter both username and password.';
            errorEl.style.display = 'block';
            e.preventDefault();
            return;
        }
    });
}


// Admin-Register
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', function (e) {
        const user = document.getElementById('username').value.trim();
        const pass = document.getElementById('password').value.trim();
        const confirm = document.getElementById('confirmPassword').value.trim();
        const errorEl = document.getElementById('error');

        // Reset
        errorEl.style.display = 'none';

        // Basic validation
        if (!user || !pass || !confirm) {
            e.preventDefault();
            errorEl.textContent = 'All fields are required.';
            errorEl.style.display = 'block';
            return;
        }
        if (pass !== confirm) {
            e.preventDefault();
            errorEl.textContent = 'Passwords do not match.';
            errorEl.style.display = 'block';
            return;
        }
    });
}


// Admin-delete
const deleteBtn = document.getElementById('deleteBtn');
const resultDivDelete = document.getElementById('result');
const successMessage = document.getElementById('successMessage');
const errorMessage = document.getElementById('errorMessage');
const successText = document.getElementById('successText');
const errorText = document.getElementById('errorText');

function showResultDelete(success, message) {
    resultDivDelete.style.display = 'block';
    if (success) {
        successMessage.style.display = 'block';
        errorMessage.style.display = 'none';
        successText.textContent = message;
    } else {
        successMessage.style.display = 'none';
        errorMessage.style.display = 'block';
        errorText.textContent = message;
    }
}

const csrf = document.querySelector('meta[name="csrf-token"]').content;
if (deleteBtn) {
    deleteBtn.addEventListener('click', function () {
        if (confirm('Are you sure you want to delete ALL user data? This action cannot be undone!')) {
            const deleteRoute = document.getElementById('delete_route').href;
            fetch(deleteRoute, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrf
                }
            })
                .then(response => response.json())
                .then(data => {
                    showResultDelete(data.status === 'success', data.message);
                })
                .catch(error => {
                    showResultDelete(false, 'An error occurred while deleting data.', error.message);
                });
        }
    });
}


// Admin-Upload
const formUploadDB = document.getElementById('upload-form');
const resultDivUpload = document.getElementById('result');

function showResultUpload(success, message, extra = '') {
    resultDivUpload.innerHTML = `
      <div class="alert alert-${success ? 'success' : 'danger'}">
        ${message}${extra ? ': ' + extra : ''}
      </div>
    `;
}

if (formUploadDB) {
    formUploadDB.addEventListener('submit', e => {
        e.preventDefault();
        const data = new FormData(formUploadDB);
        const uploadRoute = document.getElementById('upload_route').href;
        fetch(uploadRoute, {
            method: 'POST',
            headers: { 'X-CSRFToken': csrf },
            body: data
        })
            .then(res => res.json())
            .then(payload => {
                showResultUpload(payload.status === 'success', payload.message);
            })
            .catch(err => {
                showResultUpload(false, 'Upload failed', err.message);
            });
    });
}
