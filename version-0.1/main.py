import flask

app = flask.Flask(__name__, static_folder="Assets", static_url_path="/Assets")

@app.route("/", methods=['GET','POST'])
def start():
    return flask.redirect("/play")

@app.route("/play", methods=['GET'])
def insert():
    task_name = flask.request.args.get("task_name", "")
    return flask.render_template("home.html", task_name=task_name)

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

        normalized_task = {
            "name": name.strip(),
            "due_date": due_date.strip(),
            "description": description,
            "dnotif": dnotif,
        }
        return flask.jsonify(
            task=normalized_task,
            forwarded=False,
            message="Flask received the task JSON. Lambda forwarding is not configured.",
        ), 202

    return flask.render_template("taskInput.html")


if __name__== "__main__":
    app.run(debug=False, host='127.0.0.1', port=5000)
