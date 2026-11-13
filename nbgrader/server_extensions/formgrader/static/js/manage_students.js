var Student = Backbone.Model.extend({
    urlRoot: base_url + "/formgrader/api/student"
});

var Students = Backbone.Collection.extend({
    model: Student,
    url: base_url + "/formgrader/api/students"
});

var StudentUI = Backbone.View.extend({

    events: {},

    initialize: function () {
        this.$modal = undefined;
        this.$modal_first_name = undefined;
        this.$modal_last_name = undefined;
        this.$modal_email = undefined;
        this.$modal_save = undefined;

        this.$name = this.$el.find(".name");
        this.$id = this.$el.find(".id");
        this.$email = this.$el.find(".email");
        this.$score = this.$el.find(".score");
        this.$edit = this.$el.find(".edit");

        this.listenTo(this.model, "change", this.render);
        this.listenTo(this.model, "request", this.animateSaving);
        this.listenTo(this.model, "sync", this.closeModal);

        this.render();
    },

    openModal: function () {
        var body = $("<table/>").addClass("table table-striped form-table");
        var tablebody = $("<tbody/>");
        body.append(tablebody);
        var id = $("<tr/>");
        tablebody.append(id);
        id.append($("<td/>").addClass("align-middle").text("Student ID"));
        id.append($("<td/>").append($("<input/>")
            .addClass("modal-id")
            .attr("type", "text")
            .attr("disabled", "disabled")));

        var first_name = $("<tr/>");
        tablebody.append(first_name);
        first_name.append($("<td/>").addClass("align-middle").text("First name (optional)"));
        first_name.append($("<td/>").append($("<input/>").addClass("modal-first-name").attr("type", "text")));

        var last_name = $("<tr/>");
        tablebody.append(last_name);
        last_name.append($("<td/>").addClass("align-middle").text("Last name (optional)"));
        last_name.append($("<td/>").append($("<input/>").addClass("modal-last-name").attr("type", "text")));

        var email = $("<tr/>");
        tablebody.append(email);
        email.append($("<td/>").addClass("align-middle").text("Email (optional)"));
        email.append($("<td/>").append($("<input/>").addClass("modal-email").attr("type", "text")));

        var footer = $("<div/>");
        footer.append($("<button/>")
            .addClass("btn btn-primary save")
            .attr("type", "button")
            .text("Save"));
        footer.append($("<button/>")
            .addClass("btn btn-danger")
            .attr("type", "button")
            .attr("data-dismiss", "modal")
            .text("Cancel"));

        this.$modal = createModal("edit-student-modal", "Editing " + this.model.get("id"), body, footer);
        this.$modal.find("input.modal-id").val(this.model.get("id"));
        this.$modal_first_name = this.$modal.find("input.modal-first-name");
        this.$modal_first_name.val(this.model.get("first_name"));
        this.$modal_last_name = this.$modal.find("input.modal-last-name");
        this.$modal_last_name.val(this.model.get("last_name"));
        this.$modal_email = this.$modal.find("input.modal-email");
        this.$modal_email.val(this.model.get("email"));
        this.$modal_save = this.$modal.find("button.save");
        this.$modal_save.click(_.bind(this.save, this));
    },

    clear: function () {
        this.$name.empty();
        this.$id.empty();
        this.$email.empty();
        this.$score.empty();
        this.$edit.empty();
    },

    render: function () {
        this.clear();

        // student name
        var last_name = this.model.get("last_name");
        if (last_name === null) last_name = "None";
        var first_name = this.model.get("first_name");
        if (first_name === null) first_name = "None";
        var name = last_name + ", " + first_name;
        this.$name.attr("data-order", name);
        this.$name.append($("<a/>")
            .attr("href", base_url + "/formgrader/manage_students/" + this.model.get("id"))
            .text(name));

        // id
        var id = this.model.get("id");
        this.$id.attr("data-order", id);
        this.$id.text(id);

        // email
        var email = this.model.get("email");
        if (email === null) email = "None";
        this.$email.attr("data-order", email);
        this.$email.text(email);

        // score
        var score = roundToPrecision(this.model.get("score"), 2);
        var max_score = roundToPrecision(this.model.get("max_score"), 2);
        if (max_score === 0) {
            this.$score.attr("data-order", 0.0);
        } else {
            this.$score.attr("data-order", score / max_score);
        }
        this.$score.text(score + " / " + max_score);

        // edit metadata
        this.$edit.append($("<a/>")
            .attr("href", "#")
            .attr("title", "Edit student")
            .click(_.bind(this.openModal, this))
            .append($("<span/>")
                .addClass("glyphicon glyphicon-pencil")
                .attr("aria-hidden", "true")));

        this.$edit.append("&nbsp;&nbsp;");
        this.$edit.append($("<a/>")
            .attr("href", "#")
            .attr("title", "Remove student")
            .click(_.bind(this.deleteModal, this))
            .append($("<span/>")
                .addClass("glyphicon glyphicon-trash text-danger")
                .attr("aria-hidden", "true")));
    },

    deleteModal: function () {
        var that = this;
        var student_id = this.model.get("id");
        var score = this.model.get("score") || 0;
        var hasGrades = score > 0;

        var body = $("<div/>");
        if (hasGrades) {
            var warningAlert = $("<div/>").addClass("alert alert-warning");
            warningAlert.append($("<strong/>").text("Warning:"));
            warningAlert.append(document.createTextNode(" Student "));
            warningAlert.append($("<code/>").text(student_id));
            warningAlert.append(document.createTextNode(" has submissions and a recorded score of " + score + "."));
            warningAlert.append($("<br/>"));
            warningAlert.append($("<br/>"));
            warningAlert.append(document.createTextNode("Removing this student from the course will also delete their submissions and grades. Are you sure you want to proceed?"));
            body.append(warningAlert);
        } else {
            body.append($("<p/>").text("Are you sure you want to remove student '" + student_id + "' from this course?"));
        }

        var footer = $("<div/>");
        var btnConfirm = $("<button/>")
            .addClass("btn btn-danger")
            .attr("type", "button")
            .text("Remove Student");
        var btnCancel = $("<button/>")
            .addClass("btn btn-default")
            .attr("type", "button")
            .attr("data-dismiss", "modal")
            .text("Cancel");
        footer.append(btnConfirm);
        footer.append(btnCancel);

        var modal = createModal("delete-student-modal", "Remove Student: " + student_id, body, footer);

        btnConfirm.click(function () {
            btnConfirm.text("Removing...").attr("disabled", "disabled");
            var url = that.model.urlRoot + "/" + encodeURIComponent(student_id);
            if (hasGrades) {
                url += "?force=true";
            }
            $.ajax({
                url: url,
                type: "DELETE",
                success: function () {
                    modal.modal("hide");
                    var tbl = $("#main-table").parent().DataTable();
                    tbl.row(that.$el).remove().draw();
                },
                error: function (xhr) {
                    btnConfirm.text("Remove Student").removeAttr("disabled");
                    var msg = "Failed to remove student.";
                    try {
                        var parsed = JSON.parse(xhr.responseText);
                        if (parsed.message) msg = parsed.message;
                    } catch (e) {
                        if (xhr.statusText) msg = xhr.statusText;
                    }
                    alert("Error: " + msg);
                }
            });
        });
    },

    save: function () {
        var first_name = this.$modal_first_name.val();
        if (first_name === "") first_name = null;

        var last_name = this.$modal_last_name.val();
        if (last_name === "") last_name = null;

        var email = this.$modal_email.val();
        if (email === "") email = null;

        this.model.save({
            "first_name": first_name,
            "last_name": last_name,
            "email": email
        }, {
            error: function (m, xhr) {
                var msg = "Failed to update student.";
                try {
                    var parsed = JSON.parse(xhr.responseText);
                    if (parsed.message) msg = parsed.message;
                } catch (e) {
                    if (xhr.statusText) msg = xhr.statusText;
                }
                alert("Error: " + msg);
            }
        });
    },

    animateSaving: function () {
        if (this.$modal_save) {
            this.$modal_save.text("Saving...");
        }
    },

    closeModal: function () {
        if (this.$modal) {
            this.$modal.modal('hide')
            this.$modal = undefined;
            this.$modal_first_name = undefined;
            this.$modal_last_name = undefined;
            this.$modal_email = undefined;
            this.$modal_save = undefined;
        }

        this.render();
    },
});

var insertRow = function (table) {
    var row = $("<tr/>");
    row.append($("<td/>").addClass("name"));
    row.append($("<td/>").addClass("text-center id"));
    row.append($("<td/>").addClass("text-center email"));
    row.append($("<td/>").addClass("text-center score"));
    row.append($("<td/>").addClass("text-center edit"));
    table.append(row)
    return row;
};

var createStudentModal = function () {
    var modal;
    var createStudent = function () {
        var id = modal.find(".id").val();
        if (id === "") {
            modal.modal('hide');
            return;
        }

        var first_name = modal.find(".first-name").val();
        if (first_name === "") first_name = null;

        var last_name = modal.find(".last-name").val();
        if (last_name === "") last_name = null;

        var email = modal.find(".email").val();
        if (email === "") email = null;

        var model = new Student({
            "id": id,
            "first_name": first_name,
            "last_name": last_name,
            "email": email
        }, {
            "collection": models
        });

        var tbl = $("#main-table");
        var row = insertRow(tbl);
        var view = new StudentUI({
            "model": model,
            "el": row
        });
        views.push(view);
        model.save(null, {
            success: function () {
                tbl.parent().DataTable().row.add(row).draw();
                modal.modal('hide');
            },
            error: function (m, xhr) {
                row.remove();
                var msg = "Failed to create student.";
                try {
                    var parsed = JSON.parse(xhr.responseText);
                    if (parsed.message) msg = parsed.message;
                } catch (e) {
                    if (xhr.statusText) msg = xhr.statusText;
                }
                alert("Error: " + msg);
            }
        });
    };

    var body = $("<table/>").addClass("table table-striped form-table");
    var tablebody = $("<tbody/>");
    body.append(tablebody);
    var id = $("<tr/>");
    tablebody.append(id);
    id.append($("<td/>").addClass("align-middle").text("Student ID"));
    id.append($("<td/>").append($("<input/>").addClass("id").attr("type", "text")));

    var first_name = $("<tr/>");
    tablebody.append(first_name);
    first_name.append($("<td/>").addClass("align-middle").text("First name (optional)"));
    first_name.append($("<td/>").append($("<input/>").addClass("first-name").attr("type", "text")));

    var last_name = $("<tr/>");
    tablebody.append(last_name);
    last_name.append($("<td/>").addClass("align-middle").text("Last name (optional)"));
    last_name.append($("<td/>").append($("<input/>").addClass("last-name").attr("type", "text")));

    var email = $("<tr/>");
    tablebody.append(email);
    email.append($("<td/>").addClass("align-middle").text("Email (optional)"));
    email.append($("<td/>").append($("<input/>").addClass("email").attr("type", "text")));

    var footer = $("<div/>");
    footer.append($("<button/>")
        .addClass("btn btn-primary save")
        .attr("type", "button")
        .click(createStudent)
        .text("Save"));
    footer.append($("<button/>")
        .addClass("btn btn-danger")
        .attr("type", "button")
        .attr("data-dismiss", "modal")
        .text("Cancel"));

    modal = createModal("add-student-modal", "Add New Student", body, footer);
};

var loadStudents = function () {
    var tbl = $("#main-table");

    models = new Students();
    views = [];
    models.loaded = false;
    models.fetch({
        success: function () {
            tbl.empty();
            models.each(function (model) {
                var view = new StudentUI({
                    "model": model,
                    "el": insertRow(tbl)
                });
                views.push(view);
            });
            insertDataTable(tbl.parent());
            models.loaded = true;
        }
    });
};

var models = undefined;
var views = [];
$(window).on('load', function () {
    loadStudents();
});
