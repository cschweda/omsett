<script setup lang="ts">
import releases from '~/generated/changelog.json'
import { CHANGELOG } from '~/utils/links'

useHead({ title: 'What’s new — Omsett' })

// "Unreleased" is the changelog's working name for changes that are live but not yet numbered.
const title = (name: string) => (name === 'Unreleased' ? 'Latest' : `Version ${name}`)
const slug = (name: string) => `release-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
</script>

<template>
  <div>
    <PageTitle title="What’s new" lead="Every change to Omsett, newest first. This page is the project’s changelog, set in type." />

    <main>
      <StepSection
        v-for="release in releases"
        :key="release.title"
        :title="title(release.title)"
        :heading-id="slug(release.title)"
      >
        <div class="release" data-testid="release">
          <p v-for="(paragraph, index) in release.intro" :key="`intro-${index}`" class="lead-text">
            <InlineText :parts="paragraph" />
          </p>
          <div v-for="group in release.groups" :key="group.title" class="group">
            <h3 v-if="group.title" class="group-title">{{ group.title }}</h3>
            <ul class="items">
              <li v-for="(item, index) in group.items" :key="index"><InlineText :parts="item" /></li>
            </ul>
          </div>
        </div>
      </StepSection>

      <p class="source"><a :href="CHANGELOG" class="text-button">The same list on GitHub</a></p>
    </main>
  </div>
</template>

<style scoped>
.release {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
  max-width: 68ch;
}
.release p {
  margin: 0;
}
.group-title {
  margin: 0 0 0.5rem;
  font-size: var(--text-small);
  font-weight: 400;
  color: var(--muted);
}
.items {
  margin: 0;
  padding: 0;
  list-style: none;
}
.items li {
  padding: 0.625rem 0;
  border-top: 1px solid var(--rule);
}
.source {
  margin: 0 0 3rem;
  font-size: var(--text-small);
}
</style>
