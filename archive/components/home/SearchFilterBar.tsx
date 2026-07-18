
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type SortOption =
  | 'newest'
  | 'oldest'
  | 'name'
  | 'grade-asc'
  | 'grade-desc'
  | 'rating'
  | 'most-liked'
  | 'most-climbed'
  | 'most-viewed';

interface SearchFilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  filterGrade: string;
  onFilterGradeChange: (grade: string) => void;
  availableGrades: string[];
  resultCount: number;
}

export function SearchFilterBar({
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  filterGrade,
  onFilterGradeChange,
  availableGrades,
  resultCount,
}: SearchFilterBarProps) {
  const hasFilters = searchQuery || filterGrade !== 'all';

  const clearFilters = () => {
    onSearchChange('');
    onFilterGradeChange('all');
  };

  return (
    <>
      {/* Mobile */}
      <div className="mb-4 md:hidden">
        <div className="flex flex-col gap-2 p-2.5 rounded-xl bg-card border border-border/50">
          {/* Search Row */}
          <div className="relative flex-1">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              placeholder="Search routes, setters..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground"
            />
          </div>

          {/* Divider */}
          <div className="h-px bg-border/50" />

          {/* Filters Row */}
          <div className="flex items-center gap-2">
            <Select value={sortBy} onValueChange={(v) => onSortChange(v as SortOption)}>
              <SelectTrigger className="flex-1 h-8 text-xs border-none bg-transparent shadow-none px-2">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Sort: Newest</SelectItem>
                <SelectItem value="oldest">Sort: Oldest</SelectItem>
                <SelectItem value="name">Sort: Name</SelectItem>
                <SelectItem value="grade-asc">Sort: Easiest</SelectItem>
                <SelectItem value="grade-desc">Sort: Hardest</SelectItem>
                <SelectItem value="rating">Sort: Top Rated</SelectItem>
                <SelectItem value="most-liked">Sort: Most Liked</SelectItem>
                <SelectItem value="most-climbed">Sort: Most Climbed</SelectItem>
                <SelectItem value="most-viewed">Sort: Most Viewed</SelectItem>
              </SelectContent>
            </Select>

            <div className="w-px h-5 bg-border/50" />

            <Select value={filterGrade} onValueChange={onFilterGradeChange}>
              <SelectTrigger className="flex-1 h-8 text-xs border-none bg-transparent shadow-none px-2">
                <SelectValue placeholder="Grade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Grades</SelectItem>
                {availableGrades.map((grade) => (
                  <SelectItem key={grade} value={grade}>
                    {grade}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasFilters && (
              <>
                <div className="w-px h-5 bg-border/50" />
                <button
                  onClick={clearFilters}
                  className="text-xs text-muted-foreground active:text-foreground transition-colors px-2"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </div>

        {hasFilters && (
          <p className="text-xs text-muted-foreground mt-2">
            {resultCount} route{resultCount !== 1 ? 's' : ''} found
          </p>
        )}
      </div>

      {/* Desktop */}
      <div className="hidden md:block mb-6">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50">
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              placeholder="Search routes, setters..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground"
            />
          </div>

          <div className="w-px h-6 bg-border" />

          <Select value={sortBy} onValueChange={(v) => onSortChange(v as SortOption)}>
            <SelectTrigger className="w-40 h-9 border-none bg-transparent shadow-none">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Sort: Newest</SelectItem>
              <SelectItem value="oldest">Sort: Oldest</SelectItem>
              <SelectItem value="name">Sort: Name</SelectItem>
              <SelectItem value="grade-asc">Sort: Easiest</SelectItem>
              <SelectItem value="grade-desc">Sort: Hardest</SelectItem>
              <SelectItem value="rating">Sort: Top Rated</SelectItem>
              <SelectItem value="most-liked">Sort: Most Liked</SelectItem>
              <SelectItem value="most-climbed">Sort: Most Climbed</SelectItem>
              <SelectItem value="most-viewed">Sort: Most Viewed</SelectItem>
            </SelectContent>
          </Select>

          <div className="w-px h-6 bg-border" />

          <Select value={filterGrade} onValueChange={onFilterGradeChange}>
            <SelectTrigger className="w-32 h-9 border-none bg-transparent shadow-none">
              <SelectValue placeholder="All Grades" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Grades</SelectItem>
              {availableGrades.map((grade) => (
                <SelectItem key={grade} value={grade}>
                  {grade}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <>
              <div className="w-px h-6 bg-border" />
              <button
                onClick={clearFilters}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
            </>
          )}
        </div>

        {hasFilters && (
          <p className="text-sm text-muted-foreground mt-2">
            {resultCount} route{resultCount !== 1 ? 's' : ''} found
          </p>
        )}
      </div>
    </>
  );
}
