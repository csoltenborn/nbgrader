{%- extends 'base.tpl' -%}

{%- block head -%}
<script src="{{ base_url }}/formgrader/static/js/bonus_results.js"></script>
{%- endblock -%}

{%- block title -%}
Bonus Results
{%- endblock -%}

{%- block sidebar -%}
<li role="presentation"><a href="{{ base_url }}/formgrader/manage_assignments">Manage Assignments</a></li>
<li role="presentation"><a href="{{ base_url }}/formgrader/gradebook">Manual Grading</a></li>
<li role="presentation"><a href="{{ base_url }}/formgrader/manage_students">Manage Students</a></li>
<li role="presentation" class="active"><a href="{{ base_url }}/formgrader/bonus_results">Bonus Results</a></li>
{%- endblock -%}

{%- block breadcrumbs -%}
<ol class="breadcrumb">
  <li class="active">Bonus Results</li>
</ol>
{%- endblock -%}

{%- block messages -%}
<div class="alert alert-info">
  Overview of student scores on assignments marked as <b>Bonus eligible</b>.
</div>
<div class="panel panel-default" id="bonus-scheme-panel">
  <div class="panel-heading">
    <a role="button" data-toggle="collapse" href="#bonus-scheme-body">Bonus scheme</a>
    <span id="bonus-scheme-summary" class="text-muted" style="margin-left: 1em;"></span>
  </div>
  <div id="bonus-scheme-body" class="panel-collapse collapse">
    <div class="panel-body">
      <form class="form-inline" id="bonus-scheme-form" onsubmit="return false;">
        <div class="form-group">
          <label for="bonus-scheme-type">Type</label>
          <select id="bonus-scheme-type" class="form-control">
            <option value="none">None</option>
            <option value="percentage">Percentage (%)</option>
            <option value="absolute">Absolute (points)</option>
          </select>
        </div>
        <div class="form-group" style="margin-left: 1em;">
          <label for="bonus-scheme-visibility">Visible to students</label>
          <select id="bonus-scheme-visibility" class="form-control">
            <option value="full">Thresholds and own bonus</option>
            <option value="thresholds">Thresholds only</option>
            <option value="hidden">Hidden</option>
          </select>
        </div>
      </form>
      <table class="table table-condensed" id="bonus-scheme-entries" style="margin-top: 1em; width: auto;">
        <thead><tr><th>Threshold (≥)</th><th>Bonus points</th><th></th></tr></thead>
        <tbody></tbody>
      </table>
      <button type="button" class="btn btn-default btn-sm" id="bonus-scheme-add">Add entry</button>
      <button type="button" class="btn btn-primary btn-sm" id="bonus-scheme-save">Save</button>
      <span id="bonus-scheme-status" style="margin-left: 1em;"></span>
    </div>
  </div>
</div>
<div style="margin-bottom: 1em;">
  <button type="button" class="btn btn-default btn-sm" id="bonus-export-csv" disabled>Export CSV</button>
</div>
{%- endblock -%}

{%- block table_header -%}
<tr id="bonus-results-header">
  <th>Student ID</th>
  <th>First Name</th>
  <th>Last Name</th>
  <th class="text-center">Total Points</th>
  <th class="text-center">Max Points</th>
  <th class="text-center">Percentage</th>
</tr>
{%- endblock -%}

{%- block table_body -%}
<tr><td colspan="6">Loading bonus results...</td></tr>
{%- endblock -%}
