import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';
import { Message } from '@lumino/messaging';
import { Widget } from '@lumino/widgets';

export interface IAssignmentResult {
  assignment_id: string;
  points: number;
  max_points: number;
  graded: boolean;
  submitted?: boolean;
}

export interface IBonusEntry {
  threshold: number;
  bonus: number;
}

export interface IBonusInfo {
  scheme_type: 'percentage' | 'absolute';
  visibility: 'full' | 'thresholds';
  entries: IBonusEntry[];
  bonus_points: number | null;
}

export interface IStudentResultsPayload {
  course_id: string;
  student_id: string;
  assignments: IAssignmentResult[];
  total_points: number;
  total_max_points: number;
  percentage: number;
  bonus?: IBonusInfo | null;
}

interface IApiResponse<T> {
  success: boolean;
  value: T;
}

async function requestResultsAPI<T>(
  endPoint: string,
  init: RequestInit = {}
): Promise<T> {
  const settings = ServerConnection.makeSettings();
  const requestUrl = URLExt.join(settings.baseUrl, endPoint);

  let response: Response;
  try {
    response = await ServerConnection.makeRequest(requestUrl, init, settings);
  } catch (error) {
    throw new ServerConnection.NetworkError(error as TypeError);
  }

  const data = await response.json();
  if (!response.ok) {
    throw new ServerConnection.ResponseError(response, data.message);
  }
  return data as T;
}

export function formatScore(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  const rounded = Math.round(value * 100) / 100;
  if (Object.is(rounded, -0)) {
    return '0';
  }
  return Number(rounded.toFixed(2)).toString();
}

export class ResultsWidget extends Widget {
  private currentCourse: string | undefined = undefined;
  private isRefreshing = false;
  private courseDefaultBtn: HTMLButtonElement;
  private courseDropdownBtn: HTMLButtonElement;
  private courseListEl: HTMLUListElement;
  private refreshBtn: HTMLButtonElement;
  private totalPointsEl: HTMLElement;
  private totalMaxPointsEl: HTMLElement;
  private percentageEl: HTMLElement;
  private progressBarEl: HTMLDivElement;
  private loadingEl: HTMLDivElement;
  private placeholderEl: HTMLDivElement;
  private errorEl: HTMLDivElement;
  private tableEl: HTMLTableElement;
  private tableBodyEl: HTMLTableSectionElement;
  private footerPointsEl: HTMLElement;
  private footerMaxPointsEl: HTMLElement;
  private footerPercentageEl: HTMLElement;
  private bonusPanelEl: HTMLDivElement;
  private bonusCurrentEl: HTMLDivElement;
  private bonusPointsEl: HTMLElement;
  private bonusThresholdHeaderEl: HTMLElement;
  private bonusTableBodyEl: HTMLTableSectionElement;
  private boundDocumentClick: (event: MouseEvent) => void;

  constructor() {
    super();
    this.addClass('nbgrader-results-content');
    this.node.style.overflowY = 'auto';

    this.node.innerHTML = [
      '<div id="results_view" class="tab-pane">',
      '  <div id="results_toolbar" class="row list_toolbar">',
      '    <div class="col-sm-8 no-padding">',
      '      <span id="results_list_info" class="toolbar_info">Point evaluation for course:</span>',
      '      <div class="btn-group btn-group-xs">',
      '        <button type="button" class="btn btn-default" id="results_course_default">Loading, please wait...</button>',
      '        <button type="button" class="btn btn-default dropdown-toggle" id="results_course_dropdown" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" disabled="disabled">',
      '          <span class="caret"></span>',
      '          <span class="sr-only">Toggle Dropdown</span>',
      '        </button>',
      '        <ul class="dropdown-menu" id="results_course_list"></ul>',
      '      </div>',
      '    </div>',
      '    <div class="col-sm-4 no-padding tree-buttons">',
      '      <span id="results_buttons" class="pull-right toolbar_buttons">',
      '        <button id="refresh_results_list" title="Refresh results" class="btn btn-default btn-xs">Refresh</button>',
      '      </span>',
      '    </div>',
      '  </div>',
      '  <div class="panel-group">',
      '    <div id="results_summary_panel" class="panel panel-default">',
      '      <div class="panel-heading">Overall Results</div>',
      '      <div class="panel-body" id="results_summary">',
      '        <div class="results-summary-metrics">',
      '          <div class="results-metric">',
      '            <span class="results-metric-label">Overall Points</span>',
      '            <span class="results-metric-value" id="results_overall_points">',
      '              <span id="results_total_points">0</span> / <span id="results_total_max_points">0</span>',
      '            </span>',
      '          </div>',
      '          <div class="results-metric">',
      '            <span class="results-metric-label">Percentage Achieved</span>',
      '            <span class="results-metric-value" id="results_percentage">0%</span>',
      '          </div>',
      '        </div>',
      '        <div class="results-progress-track" aria-hidden="true">',
      '          <div id="results_progress_bar" class="results-progress-fill" style="width: 0%;"></div>',
      '        </div>',
      '      </div>',
      '    </div>',
      '    <div id="results_bonus_panel" class="panel panel-default" hidden>',
      '      <div class="panel-heading">Bonus</div>',
      '      <div class="panel-body">',
      '        <div id="results_bonus_current" class="results-metric" hidden>',
      '          <span class="results-metric-label">Current bonus</span>',
      '          <span class="results-metric-value" id="results_bonus_points">0</span>',
      '        </div>',
      '        <table class="results-table results-bonus-table">',
      '          <thead><tr><th id="results_bonus_threshold_header">Threshold</th><th class="results-col-num">Bonus points</th></tr></thead>',
      '          <tbody id="results_bonus_table_body"></tbody>',
      '        </table>',
      '        <div class="results-bonus-note">Bonus is calculated live from your current results and may change until the end of the class.</div>',
      '      </div>',
      '    </div>',
      '    <div id="results_assignments_panel" class="panel panel-default">',
      '      <div class="panel-heading">Assignments eligible for bonus</div>',
      '      <div class="panel-body results-table-panel-body">',
      '        <div id="results_loading" class="list_loading"><div>Loading, please wait...</div></div>',
      '        <div id="results_placeholder" class="list_placeholder" hidden><div>There are no assignments eligible for bonus for this course yet.</div></div>',
      '        <div id="results_error" class="list_error alert alert-danger" hidden></div>',
      '        <table id="results_table" class="results-table" hidden>',
      '          <thead>',
      '            <tr>',
      '              <th>Assignment</th>',
      '              <th class="results-col-status">Status</th>',
      '              <th class="results-col-num">Achieved Points</th>',
      '              <th class="results-col-num">Overall Points</th>',
      '            </tr>',
      '          </thead>',
      '          <tbody id="results_table_body"></tbody>',
      '          <tfoot id="results_table_footer">',
      '            <tr class="results-total-row">',
      '              <td><strong>Total</strong></td>',
      '              <td class="results-col-status"><strong id="results_footer_percentage">0%</strong></td>',
      '              <td class="results-col-num"><strong id="results_footer_points">0</strong></td>',
      '              <td class="results-col-num"><strong id="results_footer_max_points">0</strong></td>',
      '            </tr>',
      '          </tfoot>',
      '        </table>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n');

    this.courseDefaultBtn = this.node.querySelector(
      '#results_course_default'
    ) as HTMLButtonElement;
    this.courseDropdownBtn = this.node.querySelector(
      '#results_course_dropdown'
    ) as HTMLButtonElement;
    this.courseListEl = this.node.querySelector(
      '#results_course_list'
    ) as HTMLUListElement;
    this.refreshBtn = this.node.querySelector(
      '#refresh_results_list'
    ) as HTMLButtonElement;
    this.totalPointsEl = this.node.querySelector(
      '#results_total_points'
    ) as HTMLElement;
    this.totalMaxPointsEl = this.node.querySelector(
      '#results_total_max_points'
    ) as HTMLElement;
    this.percentageEl = this.node.querySelector(
      '#results_percentage'
    ) as HTMLElement;
    this.progressBarEl = this.node.querySelector(
      '#results_progress_bar'
    ) as HTMLDivElement;
    this.loadingEl = this.node.querySelector(
      '#results_loading'
    ) as HTMLDivElement;
    this.placeholderEl = this.node.querySelector(
      '#results_placeholder'
    ) as HTMLDivElement;
    this.errorEl = this.node.querySelector('#results_error') as HTMLDivElement;
    this.tableEl = this.node.querySelector(
      '#results_table'
    ) as HTMLTableElement;
    this.tableBodyEl = this.node.querySelector(
      '#results_table_body'
    ) as HTMLTableSectionElement;
    this.footerPointsEl = this.node.querySelector(
      '#results_footer_points'
    ) as HTMLElement;
    this.footerMaxPointsEl = this.node.querySelector(
      '#results_footer_max_points'
    ) as HTMLElement;
    this.footerPercentageEl = this.node.querySelector(
      '#results_footer_percentage'
    ) as HTMLElement;
    this.bonusPanelEl = this.node.querySelector(
      '#results_bonus_panel'
    ) as HTMLDivElement;
    this.bonusCurrentEl = this.node.querySelector(
      '#results_bonus_current'
    ) as HTMLDivElement;
    this.bonusPointsEl = this.node.querySelector(
      '#results_bonus_points'
    ) as HTMLElement;
    this.bonusThresholdHeaderEl = this.node.querySelector(
      '#results_bonus_threshold_header'
    ) as HTMLElement;
    this.bonusTableBodyEl = this.node.querySelector(
      '#results_bonus_table_body'
    ) as HTMLTableSectionElement;

    this.courseDropdownBtn.addEventListener('click', () => {
      this.courseListEl.classList.toggle('open');
    });

    this.refreshBtn.addEventListener('click', () => {
      void this.refresh();
    });

    this.boundDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || target.closest('button') !== this.courseDropdownBtn) {
        this.courseListEl.classList.remove('open');
      }
    };
  }

  protected onAfterAttach(msg: Message): void {
    super.onAfterAttach(msg);
    document.addEventListener('click', this.boundDocumentClick);
    void this.refresh();
  }

  protected onBeforeDetach(msg: Message): void {
    document.removeEventListener('click', this.boundDocumentClick);
    super.onBeforeDetach(msg);
  }

  protected onUpdateRequest(msg: Message): void {
    super.onUpdateRequest(msg);
    void this.refresh();
  }

  public async refresh(): Promise<void> {
    if (this.isRefreshing) {
      return;
    }
    this.isRefreshing = true;
    this.setLoadingState();

    try {
      const coursesResp = await requestResultsAPI<IApiResponse<string[] | string>>(
        'results/courses'
      );
      if (!coursesResp.success) {
        this.courseDefaultBtn.innerText = 'Error fetching courses!';
        this.showError(String(coursesResp.value));
        return;
      }

      const courses = coursesResp.value as string[];
      this.renderCourseDropdown(courses);

      if (courses.length === 0) {
        this.currentCourse = undefined;
        this.courseDefaultBtn.innerText = 'No courses found.';
        this.renderSummary(0, 0, 0);
        this.showPlaceholder();
        return;
      }

      if (!this.currentCourse || !courses.includes(this.currentCourse)) {
        this.currentCourse = courses[0];
      }
      this.courseDefaultBtn.innerText = this.currentCourse;
      await this.loadCourseResults(this.currentCourse);
    } catch (err) {
      this.courseDefaultBtn.innerText = 'Error fetching courses!';
      this.showError(`Failed to load courses: ${err}`);
    } finally {
      this.isRefreshing = false;
    }
  }

  private renderCourseDropdown(courses: string[]): void {
    this.courseListEl.innerHTML = '';
    if (courses.length === 0) {
      this.courseDropdownBtn.setAttribute('disabled', 'disabled');
      return;
    }
    courses.forEach(course => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#';
      a.innerText = course;
      a.addEventListener('click', event => {
        event.preventDefault();
        this.courseListEl.classList.remove('open');
        void this.selectCourse(course);
      });
      li.appendChild(a);
      this.courseListEl.appendChild(li);
    });
    this.courseDropdownBtn.removeAttribute('disabled');
  }

  private async selectCourse(course: string): Promise<void> {
    this.currentCourse = course;
    this.courseDefaultBtn.innerText = course;
    this.setLoadingState();
    try {
      await this.loadCourseResults(course);
    } catch (err) {
      this.showError(`Failed to load results: ${err}`);
    }
  }

  private async loadCourseResults(course: string): Promise<void> {
    const query = `results?course_id=${encodeURIComponent(course)}`;
    const resp = await requestResultsAPI<
      IApiResponse<IStudentResultsPayload | string>
    >(query);

    if (!resp.success) {
      this.showError(String(resp.value));
      return;
    }

    const payload = resp.value as IStudentResultsPayload;
    this.renderResults(payload);
  }

  private renderSummary(
    totalPoints: number,
    totalMaxPoints: number,
    percentage: number
  ): void {
    const ptsText = formatScore(totalPoints);
    const maxText = formatScore(totalMaxPoints);
    const pctText = `${formatScore(percentage)}%`;

    this.totalPointsEl.innerText = ptsText;
    this.totalMaxPointsEl.innerText = maxText;
    this.percentageEl.innerText = pctText;
    this.footerPointsEl.innerText = ptsText;
    this.footerMaxPointsEl.innerText = maxText;
    this.footerPercentageEl.innerText = pctText;

    const clamped = Math.max(0, Math.min(100, Number.isFinite(percentage) ? percentage : 0));
    this.progressBarEl.style.width = `${clamped}%`;
  }

  private renderResults(payload: IStudentResultsPayload): void {
    const assignments = payload.assignments || [];
    this.renderSummary(
      payload.total_points ?? 0,
      payload.total_max_points ?? 0,
      payload.percentage ?? 0
    );
    this.renderBonus(payload.bonus);

    this.tableBodyEl.innerHTML = '';
    if (assignments.length === 0) {
      this.showPlaceholder();
      return;
    }

    assignments.forEach(item => {
      const tr = document.createElement('tr');
      tr.className = 'results-assignment-row';
      tr.setAttribute('data-assignment-id', item.assignment_id);

      const nameTd = document.createElement('td');
      nameTd.className = 'results-assignment-name';
      nameTd.innerText = item.assignment_id;

      const statusTd = document.createElement('td');
      statusTd.className = 'results-col-status results-assignment-status';
      const badge = document.createElement('span');
      if (item.graded) {
        badge.className = 'results-badge results-badge-graded';
        badge.innerText = 'Graded';
      } else if (item.submitted) {
        badge.className = 'results-badge results-badge-submitted results-status-submitted';
        badge.innerText = 'Submitted (pending grading)';
      } else {
        badge.className = 'results-badge results-badge-ungraded results-status-ungraded';
        badge.innerText = 'Not submitted';
      }
      statusTd.appendChild(badge);

      const ptsTd = document.createElement('td');
      ptsTd.className = 'results-col-num results-assignment-points';
      ptsTd.innerText = formatScore(item.points);

      const maxTd = document.createElement('td');
      maxTd.className = 'results-col-num results-assignment-max-points';
      maxTd.innerText = formatScore(item.max_points);

      tr.appendChild(nameTd);
      tr.appendChild(statusTd);
      tr.appendChild(ptsTd);
      tr.appendChild(maxTd);
      this.tableBodyEl.appendChild(tr);
    });

    this.loadingEl.hidden = true;
    this.placeholderEl.hidden = true;
    this.errorEl.hidden = true;
    this.tableEl.hidden = false;
  }

  private renderBonus(bonus?: IBonusInfo | null): void {
    if (!bonus || !bonus.entries || bonus.entries.length === 0) {
      this.bonusPanelEl.hidden = true;
      return;
    }

    this.bonusPanelEl.hidden = false;
    this.bonusThresholdHeaderEl.textContent =
      bonus.scheme_type === 'percentage'
        ? 'Percentage achieved'
        : 'Points achieved';

    if (bonus.visibility === 'full' && bonus.bonus_points !== null) {
      this.bonusPointsEl.textContent = String(bonus.bonus_points);
      this.bonusCurrentEl.hidden = false;
    } else {
      this.bonusCurrentEl.hidden = true;
    }

    this.bonusTableBodyEl.innerHTML = '';
    const unit = bonus.scheme_type === 'percentage' ? '%' : ' points';
    let activeHighlighted = false;

    bonus.entries.forEach(e => {
      const tr = document.createElement('tr');

      const threshTd = document.createElement('td');
      threshTd.textContent = `≥ ${formatScore(e.threshold)}${unit}`;

      const bonusTd = document.createElement('td');
      bonusTd.className = 'results-col-num';
      bonusTd.textContent = String(e.bonus);

      if (
        bonus.visibility === 'full' &&
        bonus.bonus_points !== null &&
        !activeHighlighted &&
        e.bonus === bonus.bonus_points
      ) {
        tr.classList.add('results-bonus-row-active');
        activeHighlighted = true;
      }

      tr.appendChild(threshTd);
      tr.appendChild(bonusTd);
      this.bonusTableBodyEl.appendChild(tr);
    });
  }

  private setLoadingState(): void {
    this.loadingEl.hidden = false;
    this.placeholderEl.hidden = true;
    this.errorEl.hidden = true;
    this.tableEl.hidden = true;
    this.bonusPanelEl.hidden = true;
  }

  private showPlaceholder(): void {
    this.loadingEl.hidden = true;
    this.placeholderEl.hidden = false;
    this.errorEl.hidden = true;
    this.tableEl.hidden = true;
    this.bonusPanelEl.hidden = true;
  }

  private showError(message: string): void {
    this.loadingEl.hidden = true;
    this.placeholderEl.hidden = true;
    this.tableEl.hidden = true;
    this.bonusPanelEl.hidden = true;
    this.errorEl.innerText = message;
    this.errorEl.hidden = false;
  }
}

