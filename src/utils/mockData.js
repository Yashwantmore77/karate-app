export const initializeMockData = () => {
  // Only skip seeding if there's genuinely tournament data already (an empty
  // "[]" left behind after deleting everything should still get reseeded).
  const existing = localStorage.getItem('tournaments')
  if (existing) {
    try {
      if (JSON.parse(existing).length > 0) return
    } catch {
      // Corrupted value — fall through and reseed.
    }
  }

  const today = new Date()

  // Create sample tournaments
  const tournaments = [
    {
      id: 'tournament-001',
      name: 'Spring National Championship',
      location: 'New York City, NY',
      date: new Date(today.getFullYear(), today.getMonth() + 2, 15).toISOString().split('T')[0],
      template: 'kata',
      status: 'draft',
      createdAt: new Date().toISOString()
    },
    {
      id: 'tournament-002',
      name: 'Summer Youth Tournament',
      location: 'Los Angeles, CA',
      date: new Date(today.getFullYear(), today.getMonth() + 3, 20).toISOString().split('T')[0],
      template: 'kumite',
      status: 'draft',
      createdAt: new Date().toISOString()
    },
    {
      id: 'tournament-003',
      name: 'Regional Qualifier 2026',
      location: 'Chicago, IL',
      date: new Date(today.getFullYear(), today.getMonth() + 1, 10).toISOString().split('T')[0],
      template: 'kata',
      status: 'draft',
      createdAt: new Date().toISOString()
    },
    {
      id: 'tournament-004',
      name: 'Winter Championship',
      location: 'Boston, MA',
      date: new Date(today.getFullYear() - 1, 11, 15).toISOString().split('T')[0],
      template: 'kumite',
      status: 'completed',
      createdAt: new Date().toISOString()
    }
  ]

  localStorage.setItem('tournaments', JSON.stringify(tournaments))

  // Create categories for each tournament
  const categoriesData = {
    'tournament-001': [
      {
        id: 'cat-001',
        tournamentId: 'tournament-001',
        name: 'U12 Boys Kata',
        ageGroup: 'U12',
        gender: 'M',
        division: 'Beginner',
        createdAt: new Date().toISOString()
      },
      {
        id: 'cat-002',
        tournamentId: 'tournament-001',
        name: 'U12 Girls Kata',
        ageGroup: 'U12',
        gender: 'F',
        division: 'Beginner',
        createdAt: new Date().toISOString()
      },
      {
        id: 'cat-003',
        tournamentId: 'tournament-001',
        name: 'U14 Mixed Team',
        ageGroup: 'U14',
        gender: 'Mixed',
        division: 'Intermediate',
        createdAt: new Date().toISOString()
      },
      {
        id: 'cat-004',
        tournamentId: 'tournament-001',
        name: 'U18 Boys Kumite',
        ageGroup: 'U18',
        gender: 'M',
        division: 'Advanced',
        createdAt: new Date().toISOString()
      }
    ],
    'tournament-002': [
      {
        id: 'cat-005',
        tournamentId: 'tournament-002',
        name: 'U10 Boys Kumite',
        ageGroup: 'U10',
        gender: 'M',
        division: 'Beginner',
        createdAt: new Date().toISOString()
      },
      {
        id: 'cat-006',
        tournamentId: 'tournament-002',
        name: 'U14 Girls Kumite',
        ageGroup: 'U14',
        gender: 'F',
        division: 'Intermediate',
        createdAt: new Date().toISOString()
      },
      {
        id: 'cat-007',
        tournamentId: 'tournament-002',
        name: 'Senior Open',
        ageGroup: '18+',
        gender: 'Mixed',
        division: 'Advanced',
        createdAt: new Date().toISOString()
      }
    ],
    'tournament-003': [
      {
        id: 'cat-008',
        tournamentId: 'tournament-003',
        name: 'U16 Boys Kata',
        ageGroup: 'U16',
        gender: 'M',
        division: 'Advanced',
        createdAt: new Date().toISOString()
      },
      {
        id: 'cat-009',
        tournamentId: 'tournament-003',
        name: 'U12 Girls Kata',
        ageGroup: 'U12',
        gender: 'F',
        division: 'Beginner',
        createdAt: new Date().toISOString()
      }
    ],
    'tournament-004': [
      {
        id: 'cat-010',
        tournamentId: 'tournament-004',
        name: 'U14 Mixed Kumite',
        ageGroup: 'U14',
        gender: 'Mixed',
        division: 'Intermediate',
        createdAt: new Date().toISOString()
      }
    ]
  }

  // Store categories
  Object.entries(categoriesData).forEach(([tournamentId, categories]) => {
    localStorage.setItem(`categories-${tournamentId}`, JSON.stringify(categories))
  })

  // Create competitors for each category
  const competitorsData = {
    'cat-001': [
      { id: 'comp-001', bib: '101', name: 'Aiden Parker', age: 11 },
      { id: 'comp-002', bib: '102', name: 'Benjamin Torres', age: 12 },
      { id: 'comp-003', bib: '103', name: 'Carlos Rodriguez', age: 11 },
      { id: 'comp-004', bib: '104', name: 'David Chen', age: 12 }
    ],
    'cat-002': [
      { id: 'comp-005', bib: '201', name: 'Emma Wilson', age: 11 },
      { id: 'comp-006', bib: '202', name: 'Fiona Smith', age: 12 },
      { id: 'comp-007', bib: '203', name: 'Grace Martinez', age: 11 }
    ],
    'cat-003': [
      { id: 'comp-008', bib: '301', name: 'Liam Johnson', age: 14 },
      { id: 'comp-009', bib: '302', name: 'Mia Davis', age: 13 },
      { id: 'comp-010', bib: '303', name: 'Noah Anderson', age: 14 }
    ],
    'cat-004': [
      { id: 'comp-011', bib: '401', name: 'Oliver Kim', age: 18 },
      { id: 'comp-012', bib: '402', name: 'Peter Jackson', age: 17 },
      { id: 'comp-013', bib: '403', name: 'Quinn Lee', age: 18 }
    ],
    'cat-005': [
      { id: 'comp-014', bib: '501', name: 'Ryan Thomas', age: 10 },
      { id: 'comp-015', bib: '502', name: 'Samuel Brown', age: 9 },
      { id: 'comp-016', bib: '503', name: 'Tyler White', age: 10 }
    ],
    'cat-006': [
      { id: 'comp-017', bib: '601', name: 'Hannah Moore', age: 14 },
      { id: 'comp-018', bib: '602', name: 'Isabella Garcia', age: 13 },
      { id: 'comp-019', bib: '603', name: 'Jasmine Taylor', age: 14 }
    ],
    'cat-007': [
      { id: 'comp-020', bib: '701', name: 'Marcus Johnson', age: 25 },
      { id: 'comp-021', bib: '702', name: 'Nathan Harris', age: 22 },
      { id: 'comp-022', bib: '703', name: 'Oscar Martin', age: 28 }
    ],
    'cat-008': [
      { id: 'comp-023', bib: '801', name: 'Patrick Young', age: 16 },
      { id: 'comp-024', bib: '802', name: 'Quinn Baker', age: 16 },
      { id: 'comp-025', bib: '803', name: 'Raymond Nelson', age: 15 }
    ],
    'cat-009': [
      { id: 'comp-026', bib: '901', name: 'Sophie Clark', age: 12 },
      { id: 'comp-027', bib: '902', name: 'Tina Lewis', age: 11 },
      { id: 'comp-028', bib: '903', name: 'Ursula Walker', age: 12 }
    ],
    'cat-010': [
      { id: 'comp-029', bib: '1001', name: 'Victor Hall', age: 14 },
      { id: 'comp-030', bib: '1002', name: 'William Allen', age: 13 },
      { id: 'comp-031', bib: '1003', name: 'Xavier King', age: 14 }
    ]
  }

  // Store competitors
  Object.entries(competitorsData).forEach(([categoryId, competitors]) => {
    localStorage.setItem(`competitors-${categoryId}`, JSON.stringify(competitors))
  })

  // Create matches for some categories
  const matchesData = {
    'cat-001': [
      {
        id: 'match-001',
        categoryId: 'cat-001',
        redId: 'comp-001',
        blueId: 'comp-002',
        status: 'completed',
        winner: 'red',
        avgRed: 8.3,
        avgBlue: 7.6,
        createdAt: new Date().toISOString()
      },
      {
        id: 'match-002',
        categoryId: 'cat-001',
        redId: 'comp-003',
        blueId: 'comp-004',
        status: 'open',
        createdAt: new Date().toISOString()
      }
    ],
    'cat-002': [
      {
        id: 'match-003',
        categoryId: 'cat-002',
        redId: 'comp-005',
        blueId: 'comp-006',
        status: 'completed',
        winner: 'blue',
        avgRed: 7.4,
        avgBlue: 8.1,
        createdAt: new Date().toISOString()
      }
    ],
    'cat-010': [
      {
        id: 'match-004',
        categoryId: 'cat-010',
        redId: 'comp-029',
        blueId: 'comp-030',
        status: 'completed',
        winner: 'red',
        avgRed: 8.7,
        avgBlue: 8.0,
        createdAt: new Date().toISOString()
      },
      {
        id: 'match-005',
        categoryId: 'cat-010',
        redId: 'comp-031',
        blueId: 'comp-029',
        status: 'completed',
        winner: 'tie',
        avgRed: 7.9,
        avgBlue: 7.9,
        createdAt: new Date().toISOString()
      }
    ]
  }

  // Store matches
  Object.entries(matchesData).forEach(([categoryId, matches]) => {
    localStorage.setItem(`matches-${categoryId}`, JSON.stringify(matches))
  })

  // Sample judge scores backing the completed matches above (4 judges each)
  const judgeScoresData = {
    'match-001': [
      { seat: 1, competitor1: 8.4, competitor2: 7.5 },
      { seat: 2, competitor1: 8.2, competitor2: 7.7 },
      { seat: 3, competitor1: 8.3, competitor2: 7.6 },
      { seat: 4, competitor1: 8.3, competitor2: 7.6 }
    ],
    'match-003': [
      { seat: 1, competitor1: 7.3, competitor2: 8.2 },
      { seat: 2, competitor1: 7.5, competitor2: 8.0 },
      { seat: 3, competitor1: 7.4, competitor2: 8.1 },
      { seat: 4, competitor1: 7.4, competitor2: 8.1 }
    ],
    'match-004': [
      { seat: 1, competitor1: 8.8, competitor2: 8.0 },
      { seat: 2, competitor1: 8.6, competitor2: 7.9 },
      { seat: 3, competitor1: 8.7, competitor2: 8.1 },
      { seat: 4, competitor1: 8.7, competitor2: 8.0 }
    ],
    'match-005': [
      { seat: 1, competitor1: 7.9, competitor2: 7.9 },
      { seat: 2, competitor1: 7.8, competitor2: 8.0 },
      { seat: 3, competitor1: 8.0, competitor2: 7.8 },
      { seat: 4, competitor1: 7.9, competitor2: 7.9 }
    ]
  }

  Object.entries(judgeScoresData).forEach(([matchId, judgeScores]) => {
    localStorage.setItem(`match-control-${matchId}`, 'revealed')
    judgeScores.forEach(({ seat, competitor1, competitor2 }) => {
      localStorage.setItem(
        `judge-${seat}-${matchId}`,
        JSON.stringify({ competitor1, competitor2, submitTime: new Date().toISOString(), judgeId: seat })
      )
    })
  })
}
