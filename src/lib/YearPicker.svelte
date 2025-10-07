<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let side: 'left' | 'right' = 'left';
  export let groups: Array<any> = [];
  export let selectedId: string;

  const dispatch = createEventDispatcher();
  let isExpanded = false;

  function select(groupId: string) {
    dispatch('select', { id: groupId });
    isExpanded = false;
  }

  function toggleExpand() {
    isExpanded = !isExpanded;
  }
</script>

<div class="year-picker-wrapper" data-side={side} class:expanded={isExpanded}>
  <button class="expand-button" on:click={toggleExpand} title={isExpanded ? 'Collapse' : 'Expand'}>
    {isExpanded ? '−' : '+'}
  </button>

  <div class="year-circles" class:expanded={isExpanded}>
    {#each groups as group, index}
      <div
        class="year-circle"
        class:selected={selectedId === group.id}
        class:is-selected-year={selectedId === group.id}
        style="--index: {index}; --total: {groups.length}"
        on:click={() => select(group.id)}
        on:keydown={(e) => e.key === 'Enter' && select(group.id)}
        role="button"
        tabindex="0"
      >
        <div class="circle">
          <div class="year-label">
            {#if group.displayYear.includes('-')}
              {@const [start, end] = group.displayYear.split('-')}
              <span class="year-line">{start}</span>
              <span class="year-line">{end}</span>
            {:else}
              <span class="year-line">{group.displayYear}</span>
            {/if}
          </div>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .year-picker-wrapper {
    position: fixed;
    top: 80px;
    z-index: 50;
  }

  .year-picker-wrapper[data-side="left"] {
    left: 10px;
  }

  .year-picker-wrapper[data-side="right"] {
    right: 10px;
  }

  .expand-button {
    position: absolute;
    top: 0;
    left: 0;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    background: white;
    border: 2px solid #4a90e2;
    color: #4a90e2;
    font-size: 18px;
    font-weight: bold;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    z-index: 200;
    transition: all 0.2s;
    line-height: 1;
    padding: 0;
  }

  .expand-button:hover {
    background: #4a90e2;
    color: white;
    transform: scale(1.1);
  }

  .year-circles {
    position: relative;
    display: grid;
    grid-template-columns: repeat(2, auto);
    grid-auto-rows: auto;
    gap: 8px;
    padding: 5px;
  }

  .year-circle {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    opacity: 0;
    transform: scale(0.5);
  }

  /* Selected year circle is always visible */
  .year-circle.is-selected-year {
    opacity: 1;
    transform: scale(1);
  }

  /* When collapsed, hide all circles except selected */
  .year-circles:not(.expanded) .year-circle:not(.is-selected-year) {
    position: absolute;
    top: 0;
    left: 0;
    opacity: 0;
    pointer-events: none;
    transform: scale(0.5);
  }

  /* When expanded, show all circles */
  .year-circles.expanded .year-circle {
    opacity: 1;
    transform: scale(1);
    pointer-events: all;
  }

  .year-circle:hover {
    transform: scale(1.08);
  }

  .circle {
    width: 50px;
    height: 50px;
    border-radius: 50%;
    border: 3px solid white;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    background: white;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .year-circle.selected .circle {
    border-color: #4a90e2;
    background: white;
    box-shadow: 0 2px 12px rgba(74, 144, 226, 0.6);
  }

  .year-label {
    font-size: 10px;
    font-weight: 700;
    color: #333;
    text-align: center;
    display: flex;
    flex-direction: column;
    line-height: 1.1;
    gap: 1px;
  }

  .year-line {
    display: block;
  }

  .year-circle.selected .year-label {
    color: #4a90e2;
  }

  @media (max-width: 640px) {
    .circle {
      width: 40px;
      height: 40px;
    }

    .year-label {
      font-size: 8px;
    }

    .expand-button {
      width: 20px;
      height: 20px;
      font-size: 16px;
    }
  }
</style>
