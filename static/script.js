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
            cell.classList.add('calendar-day');
            // 1) Wrap the date in its own element
            const num = document.createElement('span');
            num.classList.add('date-number');
            num.style.zIndex = '2';
            num.style.position = 'relative';

            // 2) Highlight today if needed
            if (
                d === today.getDate() &&
                currentMonth === today.getMonth() &&
                currentYear === today.getFullYear()
            ) {
                cell.classList.add('today');
            }

            // 3) Leaves logic
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

                // 4) Build the badges container
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
                    labelsContainer.append(span);
                });

                cell.append(labelsContainer);
            }

            num.textContent = d;
            cell.append(num);
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

// Account page logic (only runs on account.html)
(function () {
    // Only run if on account page
    if (!document.querySelector('.settings-card') || !document.getElementById('tab-account')) return;

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
    tabs.forEach(tab => {
        tab.addEventListener('click', function () {
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.add('d-none'));
            this.classList.add('active');
            document.getElementById('tab-' + this.dataset.tab).classList.remove('d-none');
            closeAllEditModes(); // Also close all edit modes when switching tabs
        });
    });

    // Inline editing for name & age (merged)
    const editNameAgeBtn = document.getElementById('edit-name-age');
    const nameAgeDisplay = document.getElementById('name-age-display');
    const nameAgeEditForm = document.getElementById('name-age-edit-form');
    const cancelNameAgeBtn = document.getElementById('cancel-name-age');
    const nameInputEdit = document.getElementById('name-input-edit');
    const ageInputEdit = document.getElementById('age-input-edit');
    let agePopup = null;
    if (editNameAgeBtn && nameAgeDisplay && nameAgeEditForm && cancelNameAgeBtn && nameInputEdit && ageInputEdit) {
        agePopup = document.createElement('div');
        agePopup.className = 'age-popup';
        agePopup.innerText = 'Age must be valid be at least 14.';
        ageInputEdit.parentElement.style.position = 'relative';
        ageInputEdit.parentElement.appendChild(agePopup);

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
        // Also validate on open
        editNameAgeBtn.addEventListener('click', function () {
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
        editDobBtn.addEventListener('click', function () {
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
              document
                .getElementById("otp-input-container")
                .classList.remove("d-none");
            } else {
              console.error("Server error:", response.status, data.error);
              alert(data.error || "Failed to send verification email. Try again later.");
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
                    document.getElementById("account-status").textContent = "VERIFIED";
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
        editFirmInfoBtn.addEventListener('click', function () {
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
        editFirmWeekendBtn.addEventListener('click', function () {
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
        editFirmLeavesBtn.addEventListener('click', function () {
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
    closeBtn?.addEventListener('click', hideLeaveModal);
    cancelBtn?.addEventListener('click', function(e) { e.preventDefault(); hideLeaveModal(); });

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
        // Find the closest .calendar-day
        while (cell && !cell.classList.contains('calendar-day') && cell !== this) {
            cell = cell.parentElement;
        }
        if (!cell || !cell.classList.contains('calendar-day')) return;
        const iso = cell.dataset.date;
        if (!iso) return;
        leaveDateInput.value = iso;
        populateLeaveTypes();
        leaveCountInput.value = 1;
        validateLeaveInput();
        showLeaveModal();
    });

    // --- Validate on change ---
    leaveTypeSelect?.addEventListener('change', validateLeaveInput);
    leaveCountInput?.addEventListener('input', validateLeaveInput);

    // --- Submit leave form via AJAX ---
    leaveForm?.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!validateLeaveInput()) return;
        saveBtn.disabled = true;
        fetch('/take_leave', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': document.querySelector('meta[name="csrf-token"]').content
            },
            body: JSON.stringify({
                date: leaveDateInput.value,
                type: leaveTypeSelect.value,
                days: leaveCountInput.value
            })
        })
            .then(r => r.json())
            .then(data => {
                if (data.status === 'ok') {
                    hideLeaveModal();
                    window.location.reload();
                } else {
                    alert(data.error || 'Failed to take leave');
                }
            })
            .catch(() => alert('Failed to take leave'))
            .finally(() => { saveBtn.disabled = false; });
    });
})();