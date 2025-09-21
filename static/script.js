let editingPatientId = null;
// Use relative paths for API calls in production
const API_BASE = window.location.origin;

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("patientForm");
    const tableBody = document.querySelector("#patientsTable tbody");
    const alertContainer = document.getElementById("alertContainer");
    const sortBySelect = document.getElementById("sortBy");
    const sortOrderSelect = document.getElementById("sortOrder");
    const refreshBtn = document.getElementById("refreshBtn");
    const cancelEditBtn = document.getElementById("cancelEdit");
    const searchInput = document.getElementById("searchInput");
    let allPatients = [];

    function showAlert(message, type = 'success') {
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show`;
        alert.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
        alertContainer.appendChild(alert);
        setTimeout(() => alert.remove(), 5000);
    }

    async function fetchPatients() {
        try {
            const sortBy = sortBySelect.value;
            let url = `${API_BASE}/view`;
            if (sortBy) {
                const order = sortOrderSelect.value;
                url = `${API_BASE}/sort?sort_by=${sortBy}&order=${order}`;
            }

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            let patients;
            if (sortBy) {
                patients = await response.json();
            } else {
                const patientsObj = await response.json();
                patients = Object.values(patientsObj);
            }

            allPatients = patients;
            renderFilteredPatients();
        } catch (error) {
            console.error('Error fetching patients:', error);
            showAlert(`Error loading patients: ${error.message}`, 'danger');
            tableBody.innerHTML = '<tr><td colspan="10" class="text-center text-danger">Error loading patients</td></tr>';
        }
    }

    function renderFilteredPatients() {
        const query = searchInput.value.toLowerCase().trim();
        const filtered = allPatients.filter(p =>
            p.name.toLowerCase().includes(query) ||
            p.city.toLowerCase().includes(query) ||
            p.verdict.toLowerCase().includes(query)
        );

        document.getElementById('patientCount').textContent = filtered.length;

        if (filtered.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">No matching patients</td></tr>';
            return;
        }

        tableBody.innerHTML = "";
        filtered.forEach(patient => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${patient.id}</td>
                <td>${patient.name}</td>
                <td>${patient.city}</td>
                <td>${patient.age}</td>
                <td>${patient.gender}</td>
                <td>${patient.height}</td>
                <td>${patient.weight}</td>
                <td>${patient.bmi}</td>
                <td>
                    <span class="badge ${getBadgeClass(patient.verdict)}" title="${getHealthTip(patient.verdict)}">
                        ${patient.verdict}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="editPatient('${patient.id}')">Edit</button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deletePatient('${patient.id}')">Delete</button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    }

    function getBadgeClass(verdict) {
        switch (verdict) {
            case 'Underweight': return 'bg-info';
            case 'Normal': return 'bg-success';
            case 'Overweight': return 'bg-warning';
            case 'Obese': return 'bg-danger';
            default: return 'bg-secondary';
        }
    }

    function getHealthTip(verdict) {
        switch (verdict) {
            case 'Underweight': return "Focus on nutrient-rich foods and strength training.";
            case 'Normal': return "Maintain your routine with balanced meals and regular activity.";
            case 'Overweight': return "Incorporate cardio and reduce processed foods.";
            case 'Obese': return "Consult a healthcare provider for a personalized plan.";
            default: return "No specific advice available.";
        }
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const patient = {
            id: document.getElementById("patientId").value,
            name: document.getElementById("name").value,
            city: document.getElementById("city").value,
            age: parseInt(document.getElementById("age").value),
            gender: document.getElementById("gender").value,
            height: parseFloat(document.getElementById("height").value),
            weight: parseFloat(document.getElementById("weight").value)
        };

        try {
            let response;
            if (editingPatientId) {
                const updateData = { ...patient };
                delete updateData.id;
                response = await fetch(`${API_BASE}/edit/${editingPatientId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(updateData)
                });
            } else {
                response = await fetch(`${API_BASE}/create`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(patient)
                });
            }

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            showAlert(result.message || (editingPatientId ? 'Patient updated successfully!' : 'Patient created successfully!'));
            form.reset();
            cancelEdit();
            fetchPatients();
            fetchStats();
        } catch (error) {
            console.error('Error saving patient:', error);
            showAlert(`Error: ${error.message}`, 'danger');
        }
    });

    window.editPatient = async (patientId) => {
        try {
            const response = await fetch(`${API_BASE}/patient/${patientId}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const patient = await response.json();

            document.getElementById("patientId").value = patient.id;
            document.getElementById("name").value = patient.name;
            document.getElementById("city").value = patient.city;
            document.getElementById("age").value = patient.age;
            document.getElementById("gender").value = patient.gender;
            document.getElementById("height").value = patient.height;
            document.getElementById("weight").value = patient.weight;

            editingPatientId = patientId;
            document.getElementById("formTitle").textContent = `Edit Patient: ${patient.name}`;
            document.getElementById("submitText").textContent = "Update Patient";
            document.getElementById("patientId").disabled = true;
            cancelEditBtn.style.display = "inline-block";
            form.scrollIntoView({ behavior: 'smooth' });
        } catch (error) {
            console.error('Error loading patient:', error);
            showAlert(`Error loading patient: ${error.message}`, 'danger');
        }
    };

    function cancelEdit() {
        editingPatientId = null;
        document.getElementById("formTitle").textContent = "Add New Patient";
        document.getElementById("submitText").textContent = "Add Patient";
        document.getElementById("patientId").disabled = false;
        cancelEditBtn.style.display = "none";
    }

    cancelEditBtn.addEventListener("click", () => {
        form.reset();
        cancelEdit();
    });

    window.deletePatient = async (patientId) => {
        if (!confirm("Are you sure you want to delete this patient?")) return;
        try {
            const response = await fetch(`${API_BASE}/delete/${patientId}`, { method: "DELETE" });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const result = await response.json();
            showAlert(result.message || 'Patient deleted successfully!');
            fetchPatients();
            fetchStats();
        } catch (error) {
            console.error('Error deleting patient:', error);
            showAlert(`Error deleting patient: ${error.message}`, 'danger');
        }
    };

    sortBySelect.addEventListener("change", fetchPatients);
    sortOrderSelect.addEventListener("change", fetchPatients);
    refreshBtn.addEventListener("click", () => {
        fetchPatients();
        fetchStats();
    });

    searchInput.addEventListener("input", renderFilteredPatients);

    async function fetchStats() {
        try {
            const response = await fetch(`${API_BASE}/stats`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const stats = await response.json();

            document.getElementById("totalPatients").textContent = stats.total;
            document.getElementById("averageBMI").textContent = stats.average_bmi;

            renderChart("verdictChart", "Verdict Breakdown", stats.verdict_counts);
            renderChart("cityChart", "City Distribution", stats.city_counts);
        } catch (error) {
            console.error("Error fetching stats:", error);
        }
    }

    function renderChart(canvasId, label, dataObj) {
        const ctx = document.getElementById(canvasId).getContext("2d");
        
        // Clear previous chart if it exists
        if (window[canvasId + "Chart"]) {
            window[canvasId + "Chart"].destroy();
        }
        
        window[canvasId + "Chart"] = new Chart(ctx, {
            type: "doughnut",
            data: {
                labels: Object.keys(dataObj),
                datasets: [{
                    label: label,
                    data: Object.values(dataObj),
                    backgroundColor: ["#0dcaf0", "#198754", "#ffc107", "#dc3545", "#6f42c1", "#20c997"],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: "bottom", labels: { color: "#333", font: { size: 14 } } },
                    tooltip: {
                        callbacks: { label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            return `${label}: ${value}`;
                        }}
                    }
                }
            }
        });
    }

    // Theme Switcher Logic
    const themeToggle = document.getElementById("themeToggle");
    const root = document.documentElement;

    function applyTheme(theme) {
        root.setAttribute("data-theme", theme);
        localStorage.setItem("theme", theme);
        updateToggleText(theme);
    }

    function updateToggleText(theme) {
        const icon = themeToggle.querySelector('.icon');
        const label = themeToggle.querySelector('.label');
        if (theme === "light") { icon.textContent = "🌙"; label.textContent = "Dark Mode"; }
        else { icon.textContent = "☀️"; label.textContent = "Light Mode"; }
    }

    const savedTheme = localStorage.getItem("theme") || "light";
    applyTheme(savedTheme);

    themeToggle.addEventListener("click", () => {
        const current = root.getAttribute("data-theme");
        const next = current === "light" ? "dark" : "light";
        applyTheme(next);
    });

    // Initial load
    fetchPatients();
    fetchStats();
});