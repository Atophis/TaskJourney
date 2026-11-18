import flask

app = flask.Flask(__name__, static_folder="Assets", static_url_path="/Assets")

@app.route("/", methods=['GET','POST'])
def start():
    return flask.redirect("/play")

@app.route("/play", methods=['GET'])
def insert():
    return flask.render_template("home.html")

if __name__== "__main__":
    app.run(debug=False, host='127.0.0.1', port=5000)
