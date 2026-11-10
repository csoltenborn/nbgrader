var lastResults = null;

var formatScore = function (value) {
    if (value === undefined || value === null || isNaN(value)) {
        return "0";
    }
    var rounded = Math.round(Number(value) * 100) / 100;
    return (Math.abs(rounded) === 0) ? "0" : rounded.toString();
};

var getUnitLabel = function (type) {
    if (type === "percentage") {
        return "%";
    }
    if (type === "absolute") {
        return "pts";
    }
    return "";
};

var updateUnitLabels = function () {
    var type = $("#bonus-scheme-type").val();
    var unit = getUnitLabel(type);
    $("#bonus-scheme-entries .bonus-threshold-unit").text(unit);
};

var createEntryRow = function (threshold, bonus) {
    var tVal = (threshold !== undefined && threshold !== null) ? threshold : "";
    var bVal = (bonus !== undefined && bonus !== null) ? bonus : "";
    var unit = getUnitLabel($("#bonus-scheme-type").val());

    var row = $("<tr/>");
    var tdThresh = $("<td/>");
    var grp = $("<div class='input-group input-group-sm' style='width: 140px;'/>");
    var inputThresh = $("<input type='number' class='form-control input-sm bonus-threshold' step='0.01' min='0'/>").val(tVal);
    var addon = $("<span class='input-group-addon bonus-threshold-unit'/>").text(unit);
    grp.append(inputThresh).append(addon);
    tdThresh.append(grp);

    var tdBON = $("<td/>");
    var inputBonus = $("<input type='number' class='form-control input-sm bonus-points' step='1' min='0' style='width: 90px;'/>").val(bVal);
    tdBON.append(inputBonus);

    var tdAction = $("<td/>");
    var btnRemove = $("<button type='button' class='btn btn-link btn-sm bonus-entry-remove'>Remove</button>");
    btnRemove.on("click", function () {
        row.remove();
    });
    tdAction.append(btnRemove);

    row.append(tdThresh).append(tdBON).append(tdAction);
    return row;
};

var renderSchemeSummary = function (scheme) {
    var summaryEl = $("#bonus-scheme-summary");
    if (!scheme || scheme.scheme_type === "none" || !scheme.entries || scheme.entries.length === 0) {
        summaryEl.text("Not configured");
        return;
    }
    var typeName = scheme.scheme_type === "percentage" ? "Percentage" : "Absolute";
    var visMap = {
        "full": "thresholds and own bonus",
        "thresholds": "thresholds only",
        "hidden": "hidden"
    };
    var visName = visMap[scheme.student_visibility] || scheme.student_visibility;
    summaryEl.text(typeName + " · " + scheme.entries.length + " entries · visible: " + visName);
};

var loadBonusScheme = function () {
    var xsrf = (typeof getCookie === "function") ? getCookie("_xsrf") : undefined;
    $.ajax({
        url: base_url + "/formgrader/api/bonus_scheme",
        type: "GET",
        dataType: "json",
        headers: xsrf ? {"X-CSRFToken": xsrf} : {},
        success: function (data) {
            if (!data.success) {
                var err = data.error || "Failed to load bonus scheme.";
                $("#bonus-scheme-status").removeClass("text-success").addClass("text-danger").text(err);
                $("#bonus-scheme-save").prop("disabled", true);
                return;
            }
            var scheme = data.value || {scheme_type: "none", student_visibility: "full", entries: []};
            $("#bonus-scheme-type").val(scheme.scheme_type || "none");
            $("#bonus-scheme-visibility").val(scheme.student_visibility || "full");

            var tbody = $("#bonus-scheme-entries tbody");
            tbody.empty();
            _.each(scheme.entries || [], function (entry) {
                tbody.append(createEntryRow(entry.threshold, entry.bonus));
            });
            updateUnitLabels();
            renderSchemeSummary(scheme);
        },
        error: function () {
            $("#bonus-scheme-status").removeClass("text-success").addClass("text-danger").text("Error loading bonus scheme.");
            $("#bonus-scheme-save").prop("disabled", true);
        }
    });
};

var collectScheme = function () {
    var schemeType = $("#bonus-scheme-type").val() || "none";
    var visibility = $("#bonus-scheme-visibility").val() || "full";
    var errors = [];
    var entries = [];
    var seenThresholds = {};

    var rows = $("#bonus-scheme-entries tbody tr");
    if (rows.length > 50) {
        errors.push("At most 50 entries allowed.");
    }

    rows.each(function (idx, el) {
        var tStr = $(el).find(".bonus-threshold").val();
        var bStr = $(el).find(".bonus-points").val();

        var tTrim = (tStr !== undefined && tStr !== null) ? String(tStr).trim() : "";
        var bTrim = (bStr !== undefined && bStr !== null) ? String(bStr).trim() : "";

        // Ignore completely empty rows
        if (tTrim === "" && bTrim === "") {
            return;
        }

        if (tTrim === "") {
            errors.push("Row " + (idx + 1) + ": Threshold is required.");
            return;
        }
        var t = Number(tTrim);
        if (isNaN(t) || !isFinite(t)) {
            errors.push("Row " + (idx + 1) + ": Threshold must be a number.");
            return;
        }
        if (t < 0) {
            errors.push("Row " + (idx + 1) + ": Threshold must be non-negative.");
            return;
        }
        if (Math.abs(Math.round(t * 100) / 100 - t) > 1e-7) {
            errors.push("Row " + (idx + 1) + ": Threshold can have at most 2 decimal places.");
            return;
        }
        if (schemeType === "percentage" && t > 100) {
            errors.push("Row " + (idx + 1) + ": Percentage threshold must be at most 100.");
            return;
        }

        var roundedT = Math.round(t * 100) / 100;
        var storedT = (Math.round(roundedT * 100) % 100 === 0) ? Math.round(roundedT) : roundedT;
        if (seenThresholds[storedT]) {
            errors.push("Duplicate threshold: " + storedT);
            return;
        }
        seenThresholds[storedT] = true;

        if (bTrim === "") {
            errors.push("Row " + (idx + 1) + ": Bonus points are required.");
            return;
        }
        var b = Number(bTrim);
        if (isNaN(b) || !isFinite(b)) {
            errors.push("Row " + (idx + 1) + ": Bonus points must be a number.");
            return;
        }
        if (b < 0) {
            errors.push("Row " + (idx + 1) + ": Bonus points must be non-negative.");
            return;
        }
        if (Math.floor(b) !== b) {
            errors.push("Bonus points must be whole numbers.");
            return;
        }
        var storedB = Math.round(b);

        entries.push({threshold: storedT, bonus: storedB});
    });

    entries.sort(function (a, b) {
        return b.threshold - a.threshold;
    });

    return {
        scheme: {
            scheme_type: schemeType,
            student_visibility: visibility,
            entries: entries
        },
        errors: errors
    };
};

var saveBonusScheme = function () {
    var res = collectScheme();
    var statusEl = $("#bonus-scheme-status");
    if (res.errors.length > 0) {
        statusEl.removeClass("text-success").addClass("text-danger").text(res.errors.join("; "));
        return;
    }

    statusEl.removeClass("text-danger text-success").text("Saving...");
    var xsrf = (typeof getCookie === "function") ? getCookie("_xsrf") : undefined;

    $.ajax({
        url: base_url + "/formgrader/api/bonus_scheme",
        type: "PUT",
        contentType: "application/json",
        data: JSON.stringify(res.scheme),
        dataType: "json",
        headers: xsrf ? {"X-CSRFToken": xsrf} : {},
        success: function (data) {
            if (data.success) {
                window.location.reload();
            } else {
                statusEl.removeClass("text-success").addClass("text-danger").text(data.error || "Failed to save bonus scheme.");
            }
        },
        error: function (xhr) {
            var msg = "Failed to save bonus scheme.";
            try {
                var d = JSON.parse(xhr.responseText);
                if (d.error) { msg = d.error; }
            } catch (e) {}
            statusEl.removeClass("text-success").addClass("text-danger").text(msg);
        }
    });
};

var csvCell = function (v) {
    if (v === undefined || v === null) {
        return "";
    }
    var s = String(v);
    if (/[";\r\n]/.test(s)) {
        s = '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
};

var csvNumber = function (v) {
    if (v === undefined || v === null || isNaN(v)) {
        return "";
    }
    return String(Math.round(Number(v) * 100) / 100);
};

var exportCsv = function () {
    if (!lastResults) {
        return;
    }
    var val = lastResults;
    var counted = val.counted_assignments || [];
    var students = val.students || [];
    var totalMax = val.total_max_points || 0.0;
    var hasActiveScheme = Boolean(val.bonus_scheme);

    var headers = ["user_id", "first_name", "last_name", "email"]
        .concat(counted)
        .concat(["total_points", "max_points", "percentage", "bonus_points"]);

    var lines = [headers.map(csvCell).join(";")];

    _.each(students, function (s) {
        var asgnMap = {};
        _.each(s.assignments || [], function (a) {
            asgnMap[a.assignment_id] = a;
        });

        var row = [
            csvCell(s.student_id),
            csvCell(s.first_name || ""),
            csvCell(s.last_name || ""),
            csvCell(s.email || "")
        ];

        _.each(counted, function (asgnId) {
            var a = asgnMap[asgnId];
            row.push((a && a.graded) ? csvNumber(a.points) : "");
        });

        row.push(csvNumber(s.total_points));
        row.push(csvNumber(s.total_max_points || totalMax));
        row.push(csvNumber(s.percentage));
        row.push((hasActiveScheme && s.bonus_points !== null && s.bonus_points !== undefined) ? csvCell(s.bonus_points) : "");

        lines.push(row.join(";"));
    });

    var csvContent = "\uFEFF" + lines.join("\r\n") + "\r\n";
    var filename = "bonus_results_" + (val.course_id || "course") + "_" + new Date().toISOString().slice(0, 10) + ".csv";
    var blob = new Blob([csvContent], {type: "text/csv;charset=utf-8"});
    var url = URL.createObjectURL(blob);
    var targetDoc = document;
    try {
        if (window.parent && window.parent.document && window.parent.document.body) {
            targetDoc = window.parent.document;
        }
    } catch (e) {}
    var a = targetDoc.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    targetDoc.body.appendChild(a);
    a.click();
    setTimeout(function () {
        try {
            targetDoc.body.removeChild(a);
        } catch (e) {}
        try {
            URL.revokeObjectURL(url);
        } catch (e) {}
    }, 2000);
};

var loadBonusResults = function () {
    var tbl = $("#main-table");
    var headerRow = $("#bonus-results-header");

    var xsrf = (typeof getCookie === "function") ? getCookie("_xsrf") : undefined;
    $.ajax({
        url: base_url + "/formgrader/api/bonus_results",
        type: "GET",
        dataType: "json",
        headers: xsrf ? {"X-CSRFToken": xsrf} : {},
        success: function (data) {
            tbl.empty();
            if (!data.success) {
                var err = data.error || "Failed to load bonus results.";
                tbl.append($("<tr/>").append($("<td colspan='6'/>").addClass("text-danger").text(err)));
                return;
            }

            var val = data.value || {};
            var counted = val.counted_assignments || [];
            var students = val.students || [];
            var totalMax = val.total_max_points || 0.0;
            var hasActiveScheme = Boolean(val.bonus_scheme);

            // Rebuild header dynamically
            headerRow.empty();
            headerRow.append($("<th/>").text("Student ID"));
            headerRow.append($("<th/>").text("First Name"));
            headerRow.append($("<th/>").text("Last Name"));
            _.each(counted, function (asgnId) {
                headerRow.append($("<th/>").addClass("text-center").text(asgnId));
            });
            headerRow.append($("<th/>").addClass("text-center").text("Total Points"));
            headerRow.append($("<th/>").addClass("text-center").text("Max Points"));
            headerRow.append($("<th/>").addClass("text-center").text("Percentage"));
            if (hasActiveScheme) {
                headerRow.append($("<th/>").addClass("text-center").text("Bonus"));
            }

            var numCols = 6 + counted.length + (hasActiveScheme ? 1 : 0);

            if (students.length === 0) {
                tbl.append($("<tr/>").append($("<td colspan='" + numCols + "'/>").text("No students found.")));
                return;
            }

            _.each(students, function (s) {
                var row = $("<tr/>");
                row.append($("<td/>").text(s.student_id));
                row.append($("<td/>").text(s.first_name || ""));
                row.append($("<td/>").text(s.last_name || ""));

                if (counted.length > 0) {
                    var asgnMap = {};
                    _.each(s.assignments || [], function (a) {
                        asgnMap[a.assignment_id] = a;
                    });

                    _.each(counted, function (asgnId) {
                        var a = asgnMap[asgnId];
                        var text = "-";
                        if (a) {
                            if (a.graded) {
                                text = formatScore(a.points) + " / " + formatScore(a.max_points);
                            } else if (a.submitted) {
                                text = "Submitted";
                            } else {
                                text = "Not submitted";
                            }
                        }
                        row.append($("<td/>").addClass("text-center").text(text));
                    });
                }

                row.append($("<td/>").addClass("text-center").text(formatScore(s.total_points)));
                row.append($("<td/>").addClass("text-center").text(formatScore(s.total_max_points || totalMax)));
                row.append($("<td/>").addClass("text-center").text(formatScore(s.percentage) + "%"));
                if (hasActiveScheme) {
                    var bText = (s.bonus_points !== null && s.bonus_points !== undefined) ? String(s.bonus_points) : "";
                    row.append($("<td/>").addClass("text-center").text(bText));
                }
                tbl.append(row);
            });

            insertDataTable(tbl.parent());

            lastResults = val;
            $("#bonus-export-csv").prop("disabled", false);
        },
        error: function () {
            tbl.empty();
            tbl.append($("<tr/>").append($("<td colspan='6'/>").addClass("text-danger").text("Error loading bonus results.")));
        }
    });
};

$(window).on("load", function () {
    $("#bonus-scheme-type").on("change", updateUnitLabels);
    $("#bonus-scheme-add").on("click", function () {
        $("#bonus-scheme-entries tbody").append(createEntryRow("", ""));
    });
    $("#bonus-scheme-save").on("click", saveBonusScheme);
    $("#bonus-export-csv").on("click", exportCsv);

    loadBonusScheme();
    loadBonusResults();
});
