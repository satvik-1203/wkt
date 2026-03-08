import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useProjects } from './hooks/useProjects';
import { useWorktrees } from './hooks/useWorktrees';
import { ProjectPicker } from './components/ProjectPicker';
import { TerminalTabList } from './components/TerminalTabList';
import { BrowserTabList } from './components/BrowserTabList';
import { EditorTabList } from './components/EditorTabList';
import { StatusBar } from './components/StatusBar';
import type { WorktreeStatus } from '../shared/types';

type View =
  | { kind: 'projects' }
  | { kind: 'project'; projectId: string }
  | { kind: 'worktree'; projectId: string; worktreePath: string };

const pageVariants = {
  enter: { opacity: 0, x: 40 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -40 },
};

export function App() {
  const { projects, error: projectError, pickAndAdd, remove } = useProjects();
  const [view, setView] = useState<View>({ kind: 'projects' });

  const selectedProjectId = view.kind !== 'projects' ? view.projectId : null;
  const { status, loading, error: statusError, refresh } = useWorktrees(selectedProjectId);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const selectedWorktree: WorktreeStatus | null =
    view.kind === 'worktree' && status
      ? status.worktrees.find((w) => w.worktree.path === view.worktreePath) ?? null
      : null;

  const handleAdd = async () => {
    const project = await pickAndAdd();
    if (project) {
      setView({ kind: 'project', projectId: project.id });
    }
  };

  const handleRemove = async (id: string) => {
    await remove(id);
    if (selectedProjectId === id) {
      setView({ kind: 'projects' });
    }
  };

  const goProjects = () => setView({ kind: 'projects' });
  const goProject = (id: string) => setView({ kind: 'project', projectId: id });
  const goWorktree = (projectId: string, path: string) =>
    setView({ kind: 'worktree', projectId, worktreePath: path });

  return (
    <div className="view-root">
      <div className="draggable-titlebar" />

      {(projectError || statusError) && (
        <div className="error-msg" style={{ margin: '0 24px' }}>
          {projectError || statusError}
        </div>
      )}

      <div className="view-content">
        <AnimatePresence mode="wait" initial={false}>
          {/* ── Screen 1: Projects grid ── */}
          {view.kind === 'projects' && (
            <motion.div
              key="projects"
              className="view-page"
              variants={pageVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2 }}
            >
              <div className="view-header">
                <h1 className="view-title">Projects</h1>
                <ProjectPicker onAdd={handleAdd} />
              </div>
              {projects.length === 0 ? (
                <div className="view-empty">No projects added yet</div>
              ) : (
                <div className="project-grid">
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      className="project-card"
                      onClick={() => goProject(project.id)}
                    >
                      <div className="project-card-name">{project.name}</div>
                      <div className="project-card-path">{project.path}</div>
                      <span
                        className="project-card-remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemove(project.id);
                        }}
                      >
                        ×
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── Screen 2: Worktree list ── */}
          {view.kind === 'project' && (
            <motion.div
              key={`project-${view.projectId}`}
              className="view-page"
              variants={pageVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2 }}
            >
              <div className="view-header">
                <button className="back-btn" onClick={goProjects}>
                  ← Projects
                </button>
              </div>
              <h1 className="view-title">
                {selectedProject?.name ?? 'Project'}
              </h1>

              {loading && !status ? (
                <div className="view-empty">Loading...</div>
              ) : status && status.worktrees.length > 0 ? (
                <>
                  <div className="section-label">worktrees</div>
                  <div className="worktree-list">
                    {status.worktrees.map((wt) => {
                      const count = wt.terminalTabs.length + wt.browserTabs.length + wt.editorTabs.length;
                      return (
                        <button
                          key={wt.worktree.path}
                          className="worktree-item"
                          onClick={() => goWorktree(view.projectId, wt.worktree.path)}
                        >
                          <span className="worktree-item-label">
                            {wt.worktree.label}
                          </span>
                          {wt.worktree.isMain && (
                            <span className="worktree-item-main">main</span>
                          )}
                          {wt.worktree.branch && (
                            <span className="worktree-item-branch">
                              {wt.worktree.branch}
                            </span>
                          )}
                          {count > 0 && (
                            <span className="worktree-item-count">{count}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="view-empty">No worktrees found</div>
              )}
            </motion.div>
          )}

          {/* ── Screen 3: Worktree detail (tabs) ── */}
          {view.kind === 'worktree' && (
            <motion.div
              key={`worktree-${view.worktreePath}`}
              className="view-page"
              variants={pageVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2 }}
            >
              <div className="view-header">
                <button className="back-btn" onClick={() => goProject(view.projectId)}>
                  ← {selectedProject?.name ?? 'Project'}
                </button>
              </div>
              <h1 className="view-title">
                {selectedProject?.name}
                <span className="view-title-sep"> / </span>
                {selectedWorktree?.worktree.label ?? 'Worktree'}
              </h1>

              {selectedWorktree ? (
                <div className="tab-detail">
                  <div className="worktree-detail-path">
                    {selectedWorktree.worktree.path}
                  </div>
                  {selectedWorktree.worktree.branch && (
                    <div className="worktree-detail-branch">
                      {selectedWorktree.worktree.branch}
                    </div>
                  )}
                  <div className="tab-detail-list">
                    {(() => {
                      const shells = selectedWorktree.terminalTabs.filter((t) => !t.port);
                      const processes = selectedWorktree.terminalTabs.filter((t) => t.port);
                      return (
                        <>
                          <div className="tab-section">
                            <div className="tab-section-header">
                              <span className="tab-section-icon terminal-icon">›_</span>
                              <span className="tab-section-label">Shell</span>
                              {shells.length > 0 && (
                                <span className="tab-section-count">{shells.length}</span>
                              )}
                            </div>
                            {shells.length > 0 ? (
                              <TerminalTabList tabs={shells} />
                            ) : (
                              <div className="view-empty-hint">No shell tabs</div>
                            )}
                          </div>

                          <div className="tab-section">
                            <div className="tab-section-header">
                              <span className="tab-section-icon process-icon">⬡</span>
                              <span className="tab-section-label">Process</span>
                              {processes.length > 0 && (
                                <span className="tab-section-count">{processes.length}</span>
                              )}
                            </div>
                            {processes.length > 0 ? (
                              <TerminalTabList tabs={processes} />
                            ) : (
                              <div className="view-empty-hint">No running processes</div>
                            )}
                          </div>
                        </>
                      );
                    })()}

                    <div className="tab-section">
                      <div className="tab-section-header">
                        <span className="tab-section-icon browser-icon">◎</span>
                        <span className="tab-section-label">Browser</span>
                        {selectedWorktree.browserTabs.length > 0 && (
                          <span className="tab-section-count">{selectedWorktree.browserTabs.length}</span>
                        )}
                      </div>
                      {selectedWorktree.browserTabs.length > 0 ? (
                        <BrowserTabList tabs={selectedWorktree.browserTabs} />
                      ) : (
                        <div className="view-empty-hint">No browser tabs</div>
                      )}
                    </div>

                    <div className="tab-section">
                      <div className="tab-section-header">
                        <span className="tab-section-icon editor-icon">{'{}'}</span>
                        <span className="tab-section-label">Editor</span>
                        {selectedWorktree.editorTabs.length > 0 && (
                          <span className="tab-section-count">{selectedWorktree.editorTabs.length}</span>
                        )}
                      </div>
                      {selectedWorktree.editorTabs.length > 0 ? (
                        <EditorTabList tabs={selectedWorktree.editorTabs} />
                      ) : (
                        <div className="view-empty-hint">No editor windows</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="view-empty">Worktree not found</div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <StatusBar
        lastRefreshed={status?.lastRefreshed ?? null}
        loading={loading}
        onRefresh={refresh}
      />
    </div>
  );
}
