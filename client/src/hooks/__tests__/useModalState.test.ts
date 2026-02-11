import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useModalState } from '../useModalState';

interface TestItem {
  id: string;
  name: string;
}

describe('useModalState', () => {
  it('starts closed with null item', () => {
    const { result } = renderHook(() => useModalState<TestItem>());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.item).toBeNull();
  });

  it('open() sets isOpen to true, item stays null', () => {
    const { result } = renderHook(() => useModalState<TestItem>());

    act(() => result.current.open());

    expect(result.current.isOpen).toBe(true);
    expect(result.current.item).toBeNull();
  });

  it('edit(item) sets isOpen to true and sets the item', () => {
    const { result } = renderHook(() => useModalState<TestItem>());
    const testItem = { id: '1', name: 'Test' };

    act(() => result.current.edit(testItem));

    expect(result.current.isOpen).toBe(true);
    expect(result.current.item).toEqual(testItem);
  });

  it('close() resets isOpen to false and item to null', () => {
    const { result } = renderHook(() => useModalState<TestItem>());

    act(() => result.current.edit({ id: '1', name: 'Test' }));
    act(() => result.current.close());

    expect(result.current.isOpen).toBe(false);
    expect(result.current.item).toBeNull();
  });

  it('open() after edit() clears the item', () => {
    const { result } = renderHook(() => useModalState<TestItem>());

    act(() => result.current.edit({ id: '1', name: 'Test' }));
    expect(result.current.item).not.toBeNull();

    act(() => result.current.open());

    expect(result.current.isOpen).toBe(true);
    expect(result.current.item).toBeNull();
  });

  it('works with primitive types', () => {
    const { result } = renderHook(() => useModalState<string>());

    act(() => result.current.edit('hello'));

    expect(result.current.isOpen).toBe(true);
    expect(result.current.item).toBe('hello');
  });

  it('close then reopen retains clean state', () => {
    const { result } = renderHook(() => useModalState<TestItem>());

    act(() => result.current.edit({ id: '1', name: 'First' }));
    act(() => result.current.close());
    act(() => result.current.open());

    expect(result.current.isOpen).toBe(true);
    expect(result.current.item).toBeNull();
  });
});
