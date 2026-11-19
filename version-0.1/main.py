import sys
from pathlib import Path

import flask

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from backend.lambda_function import handler as lambda_handler


app = flask.Flask(__name__, static_folder="Assets", static_url_path="/Assets")
LOCAL_USER_ID = "local-user"


def _invoke_lambda(method, path, body=None):
    event = {
        "rawPath": path,
        "requestContext": {
            "http": {"method": method},
            "authorizer": {
                "jwt": {"claims": {"sub": LOCAL_USER_ID}}
            },
        },
    }
    if body is not None:
        event["body"] = body

    response = lambda_handler(event, None)
    return flask.make_response(
        (
            response["body"],
            response["statusCode"],
            response.get("headers", {}),
        )
    )


@app.route("/", methods=['GET','POST'])
def start():
    return flask.redirect("/play")

@app.route("/play", methods=['GET'])
def insert():
    task_id = flask.request.args.get("task_id", "").strip()
    task_name = flask.request.args.get("task_name", "")
    task = None

    if task_id:
        response = _invoke_lambda("GET", f"/tasks/{task_id}")
        if response.status_code != 200:
            return response
        task = response.get_json()["task"]
    elif task_name:
        response = _invoke_lambda("GET", "/tasks")
        if response.status_code != 200:
            return response
        tasks = response.get_json()["tasks"]
        task = next((item for item in tasks if item["name"] == task_name), None)

    return flask.render_template("home.html", task=task)

@app.route("/shop", methods=['GET'])
def shop():
    return flask.render_template("shop.html")

@app.route("/faq", methods=['GET'])
def faq():
    return flask.render_template("faq.html")

@app.route("/notificationSettings", methods=['GET'])
def notification_settings():
    return flask.render_template("notificationSetting.html")

@app.route("/login", methods=['GET'])
def login():
    return flask.render_template("login.html")

@app.route("/viewSelec", methods=['GET'])
def view_selection():
    return flask.render_template("viewSelec.html")

@app.route("/register", methods=['GET'])
def register():
    return flask.render_template("register.html")

@app.route("/userSettings", methods=['GET'])
def user_settings():
    return flask.render_template("userSetting.html")

@app.route("/purchaseHistory", methods=['GET'])
def purchase_history():
    return flask.render_template("purchaseHistory.html")

@app.route("/questLog", methods=['GET'])
def quest_log():
    return flask.render_template("questLog.html")

@app.route("/taskInput", methods=["GET", "POST"])
def task_input():
    if flask.request.method == "POST":
        task = flask.request.get_json(silent=True)
        if not isinstance(task, dict):
            return flask.jsonify(error="Request body must be a JSON object"), 400

        unsupported_fields = set(task) - {"name", "due_date", "description", "dnotif"}
        if unsupported_fields:
            return flask.jsonify(
                error=f"Unsupported task fields: {', '.join(sorted(unsupported_fields))}"
            ), 400

        name = task.get("name")
        due_date = task.get("due_date")
        description = task.get("description", "")
        dnotif = task.get("dnotif", "")
        if not isinstance(name, str) or not name.strip():
            return flask.jsonify(error="name is required"), 400
        if not isinstance(due_date, str) or not due_date.strip():
            return flask.jsonify(error="due_date is required"), 400
        if not isinstance(description, str):
            return flask.jsonify(error="description must be a string"), 400
        if not isinstance(dnotif, str):
            return flask.jsonify(error="dnotif must be a string"), 400

        return _invoke_lambda(
            "POST",
            "/tasks",
            flask.request.get_data(as_text=True),
        )

    return flask.render_template("taskInput.html")


@app.route("/tasks", methods=["GET"])
def list_tasks():
    return _invoke_lambda("GET", "/tasks")


@app.route("/tasks/<task_id>", methods=["GET"])
def get_task(task_id):
    return _invoke_lambda("GET", f"/tasks/{task_id}")


if __name__== "__main__":
    app.run(debug=False, host='127.0.0.1', port=5000)
