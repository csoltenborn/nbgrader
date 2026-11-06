var formatScore = function (value) {
    if (value === undefined || value === null || isNaN(value)) {
        return "0";
    }
    var rounded = Math.round(Number(value) * 100) / 100;
    return (Math.abs(rounded) === 0) ? "0" : rounded.toString();
};

var loadBonusResults = function () {
    var tbl = $("#main-table");
    var headerRow = $("#bonus-results-header");

    $.ajax({
        url: base_url + "/formgrader/api/bonus_results",
        type: "GET",
        dataType: "json",
        success: function (data) {
            tbl.empty();
            if (!data.success) {
                var err = data.error || "Failed to load bonus results.";
                tbl.append($("<tr/>").append($("<td colspan='4'/>").addClass("text-danger").text(err)));
                return;
            }

            var val = data.value || {};
            var counted = val.counted_assignments || [];
            var students = val.students || [];
            var totalMax = val.total_max_points || 0.0;

            // Rebuild header dynamically if counted assignments exist
            if (counted.length > 0) {
                headerRow.empty();
                headerRow.append($("<th/>").text("Student ID"));
                _.each(counted, function (asgnId) {
                    headerRow.append($("<th/>").addClass("text-center").text(asgnId));
                });
                headerRow.append($("<th/>").addClass("text-center").text("Total Points"));
                headerRow.append($("<th/>").addClass("text-center").text("Max Points"));
                headerRow.append($("<th/>").addClass("text-center").text("Percentage"));
            }

            var numCols = 4 + counted.length;

            if (students.length === 0) {
                tbl.append($("<tr/>").append($("<td colspan='" + numCols + "'/>").text("No students found.")));
                return;
            }

            _.each(students, function (s) {
                var row = $("<tr/>");
                row.append($("<td/>").text(s.student_id));

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
                tbl.append(row);
            });

            insertDataTable(tbl.parent());
        },
        error: function () {
            tbl.empty();
            tbl.append($("<tr/>").append($("<td colspan='4'/>").addClass("text-danger").text("Error loading bonus results.")));
        }
    });
};

$(window).on('load', function () {
    loadBonusResults();
});

