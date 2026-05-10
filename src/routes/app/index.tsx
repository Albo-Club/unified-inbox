import { createFileRoute } from '@tanstack/react-router';
import { TodosList } from '~/components/TodosList';

export const Route = createFileRoute('/app/')({
  component: TodosPage,
});

function TodosPage() {
  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <div className="mb-8">
        <h1 className="albo-h2 mb-1">Today</h1>
        <p className="albo-paragraph text-muted-foreground">
          Your todos. Ask the AI on the right to add, update, or summarize them.
        </p>
      </div>
      <TodosList />
    </div>
  );
}
