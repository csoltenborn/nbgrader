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
{%- endblock -%}

{%- block table_header -%}
<tr id="bonus-results-header">
  <th>Student ID</th>
  <th class="text-center">Total Points</th>
  <th class="text-center">Max Points</th>
  <th class="text-center">Percentage</th>
</tr>
{%- endblock -%}

{%- block table_body -%}
<tr><td colspan="4">Loading bonus results...</td></tr>
{%- endblock -%}

