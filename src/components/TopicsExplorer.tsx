import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { STARTER_TOPICS, SUBJECT_FILTERS } from '../data/starterTopics';
import type { StarterTopic, TeachingLevel } from '../types/lesson';

interface TopicsExplorerProps {
  onSelectTopic: (topic: StarterTopic) => void;
  isLoading: boolean;
}

const LEVEL_LABELS: Record<TeachingLevel, string> = {
  beginner: 'Noldan (Oddiy)',
  intermediate: "O'rta",
  deep: 'Batafsil',
};

export function TopicsExplorer({ onSelectTopic, isLoading }: TopicsExplorerProps) {
  const [selectedSubject, setSelectedSubject] = useState('Barchasi');

  const filteredTopics =
    selectedSubject === 'Barchasi'
      ? STARTER_TOPICS
      : STARTER_TOPICS.filter((t) => t.subject === selectedSubject);

  return (
    <section
      id="topics"
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 border-t border-[#1B2D5C]"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <p className="text-xs font-medium text-sky-400 mb-1.5">Tayyor mavzular</p>
          <h2 className="font-display text-2xl font-bold text-white tracking-tight">
            Bir marta bosib darsni sinab ko&apos;ring
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0C1736] border border-[#1B2D5C] rounded-lg self-start">
          {SUBJECT_FILTERS.map((subject) => {
            const active = selectedSubject === subject;
            return (
              <button
                key={subject}
                type="button"
                onClick={() => setSelectedSubject(subject)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:text-white hover:bg-[#132247]'
                }`}
              >
                {subject}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredTopics.map((topic) => (
          <button
            key={topic.id}
            type="button"
            disabled={isLoading}
            onClick={() => onSelectTopic(topic)}
            className="group text-left bg-[#0C1736] border border-[#1B2D5C] hover:border-sky-400/70 hover:bg-[#101F47] rounded-xl p-6 transition-colors flex flex-col justify-between cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <div>
              <div className="flex items-center justify-between gap-2 text-xs text-slate-400 mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sky-300">{topic.subject}</span>
                  <span aria-hidden="true">·</span>
                  <span>{LEVEL_LABELS[topic.level]}</span>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-sky-400 transition-colors shrink-0" />
              </div>

              <h3 className="font-display text-lg font-semibold text-white group-hover:text-sky-200 transition-colors">
                {topic.title}
              </h3>

              <p className="mt-2 text-sm text-slate-300 leading-relaxed line-clamp-3">
                {topic.question}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-[#1B2D5C] text-xs text-slate-400">
              {topic.focusNote}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
