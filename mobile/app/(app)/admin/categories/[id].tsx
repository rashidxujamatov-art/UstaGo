import { useLocalSearchParams } from 'expo-router';
import { CategoryEdit } from '../../../../src/admin/CategoryEdit';

/** Categories: edit (categories.manage). The slug is fixed after creation. */
export default function AdminCategoryEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CategoryEdit id={id} />;
}
