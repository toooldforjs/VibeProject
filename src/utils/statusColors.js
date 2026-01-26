/**
 * Определяет цвет статуса в зависимости от типа задачи и названия статуса
 * @param {string} issueType - Тип задачи (Epic, Story, Task, Sub-task)
 * @param {string} statusName - Название статуса
 * @returns {string} - Цвет для Badge компонента Mantine
 */
export function getStatusColor(issueType, statusName) {
  if (!statusName) return 'gray';
  
  const normalizedStatus = statusName.toLowerCase().trim();
  const normalizedIssueType = (issueType || '').toLowerCase().trim();
  
  // Статусы эпиков
  if (normalizedIssueType === 'epic') {
    const epicStatuses = {
      'open': 'gray',
      'discovery': 'blue',
      'in progress': 'blue',
      'done': 'green',
      'cancelled': 'red',
    };
    return epicStatuses[normalizedStatus] || 'gray';
  }
  
  // Статусы историй
  if (normalizedIssueType === 'story') {
    const storyStatuses = {
      'backlog': 'gray',
      'todo': 'gray',
      'need info': 'gray',
      'in progress': 'blue',
      'code review': 'blue',
      'fixes after review': 'blue',
      'ready for qa': 'gray',
      'rework': 'blue',
      'qa': 'blue',
      'tested': 'green',
      'ready for release': 'green',
      'done': 'green',
      'cancelled': 'red',
    };
    return storyStatuses[normalizedStatus] || 'gray';
  }
  
  // Статусы задач (аналогично историям)
  if (normalizedIssueType === 'task') {
    const taskStatuses = {
      'backlog': 'gray',
      'todo': 'gray',
      'need info': 'gray',
      'in progress': 'blue',
      'code review': 'blue',
      'fixes after review': 'blue',
      'ready for qa': 'gray',
      'rework': 'blue',
      'qa': 'blue',
      'tested': 'green',
      'ready for release': 'green',
      'done': 'green',
      'cancelled': 'red',
    };
    return taskStatuses[normalizedStatus] || 'gray';
  }
  
  // Статусы подзадач
  if (normalizedIssueType === 'sub-task' || normalizedIssueType === 'subtask' || normalizedIssueType === 'подзадача') {
    const subtaskStatuses = {
      'open': 'gray',
      'in progress': 'blue',
      'on hold': 'gray',
      'need info': 'gray',
      'ready for review': 'gray',
      'code review': 'blue',
      'marking': 'blue',
      'validation': 'blue',
      'ready for qa': 'gray',
      'qa blocked': 'blue',
      'qa': 'blue',
      'qa ended': 'green',
      'ready for release': 'green',
      'done': 'green',
      'reopened': 'gray',
      'cancelled': 'red',
    };
    return subtaskStatuses[normalizedStatus] || 'gray';
  }
  
  // Для всех остальных типов задач и неизвестных статусов - серый
  return 'gray';
}

/**
 * Определяет цвет типа задачи для бейджа
 * @param {string} issueType - Тип задачи (Epic, Story, Task, Sub-task)
 * @returns {string} - Цвет для Badge компонента Mantine
 */
export function getIssueTypeColor(issueType) {
  if (!issueType) return 'gray';
  
  const normalizedIssueType = issueType.toLowerCase().trim();
  
  if (normalizedIssueType === 'epic') {
    return 'violet';
  }
  
  if (normalizedIssueType === 'story') {
    return 'green';
  }
  
  if (normalizedIssueType === 'task') {
    return 'blue';
  }
  
  if (normalizedIssueType === 'sub-task' || normalizedIssueType === 'subtask' || normalizedIssueType === 'подзадача') {
    return 'blue';
  }
  
  // Для всех остальных типов - серый
  return 'gray';
}
