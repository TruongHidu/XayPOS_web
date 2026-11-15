import { Route } from 'react-router-dom'
import { SectionGuard } from './appRoutes'
import { readySections } from './sections'

/** Route elements for every ready section, each behind its guard. */
export function renderSectionRoutes() {
  return readySections.map((section) => (
    <Route key={section.id} element={section.guard ?? <SectionGuard section={section} />}>
      {section.routes.map((route) => (
        <Route key={route.path} path={route.path} element={route.element} />
      ))}
    </Route>
  ))
}
