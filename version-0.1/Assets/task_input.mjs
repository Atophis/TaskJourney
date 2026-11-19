const form = document.getElementById("taskForm");
const status = document.getElementById("taskFormStatus");

if (!(form instanceof HTMLFormElement) || !(status instanceof HTMLElement)) {
    throw new Error("Task form or status message element is missing");
}

const submitButton = form.querySelector('button[type="submit"]');

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.textContent = "";
    submitButton.disabled = true;

    const formData = new FormData(form);
    const name = String(formData.get("questname") ?? "").trim();
    const date = String(formData.get("ddate") ?? "");
    const time = String(formData.get("dtime") ?? "");
    if (!name || !date || !time) {
        status.textContent = "Enter a title, due date, and due time.";
        submitButton.disabled = false;
        return;
    }

    const dueDate = new Date(`${date}T${time}:00`);
    if (
        Number.isNaN(dueDate.getTime())
        || dueDate.getFullYear() !== Number(date.slice(0, 4))
        || dueDate.getMonth() !== Number(date.slice(5, 7)) - 1
        || dueDate.getDate() !== Number(date.slice(8, 10))
        || dueDate.getHours() !== Number(time.slice(0, 2))
        || dueDate.getMinutes() !== Number(time.slice(3, 5))
    ) {
        status.textContent = "Enter a valid due date and time.";
        submitButton.disabled = false;
        return;
    }

    const task = {
        name,
        due_date: dueDate.toISOString(),
        description: String(formData.get("desc") ?? ""),
        dnotif: String(formData.get("dnotif") ?? ""),
    };

    try {
        const response = await fetch(form.action, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(task),
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || `Request failed (${response.status})`);
        }
        const homeUrl = new URL("/play", window.location.origin);
        homeUrl.searchParams.set("task_id", result.task.event_id);
        window.location.assign(homeUrl.toString());
    } catch (error) {
        status.textContent = `Unable to send task to Flask: ${error.message}`;
    } finally {
        submitButton.disabled = false;
    }
});
