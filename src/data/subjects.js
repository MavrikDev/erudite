export const subjects = [
  {
    id: 'computer-science',
    name: 'Computer Science',
    examBoard: 'AQA',
    specCode: '7516/7517',
    icon: '💻',
    color: '#4361ee',
    description: 'AQA A-Level Computer Science',
    levels: {
      as: {
        name: 'AS Level (7516)',
        papers: ['Paper 1: On-screen Exam', 'Paper 2: Written Exam'],
        topics: [
          'Fundamentals of Programming',
          'Fundamentals of Data Structures',
          'Systematic Approach to Problem Solving',
          'Theory of Computation',
          'Fundamentals of Data Representation',
          'Fundamentals of Computer Systems',
          'Fundamentals of Computer Organisation & Architecture',
          'Consequences of Uses of Computing',
          'Fundamentals of Communication & Networking',
        ]
      },
      a2: {
        name: 'A Level (7517)',
        papers: ['Paper 1: On-screen Exam', 'Paper 2: Written Exam'],
        topics: [
          'Fundamentals of Programming',
          'Fundamentals of Data Structures',
          'Fundamentals of Algorithms',
          'Theory of Computation',
          'Fundamentals of Data Representation',
          'Fundamentals of Computer Systems',
          'Fundamentals of Computer Organisation & Architecture',
          'Consequences of Uses of Computing',
          'Fundamentals of Communication & Networking',
          'Fundamentals of Databases',
          'Big Data',
          'Fundamentals of Functional Programming',
          'Systematic Approach to Problem Solving',
        ]
      }
    }
  },
  {
    id: 'maths',
    name: 'Mathematics',
    examBoard: 'AQA',
    specCode: '7356/7357',
    icon: '📐',
    color: '#10b981',
    description: 'AQA A-Level Mathematics',
    levels: {
      as: {
        name: 'AS Level (7356)',
        papers: ['Paper 1: Pure Mathematics', 'Paper 2: Statistics and Mechanics'],
        topics: [
          'Proof',
          'Algebra and Functions',
          'Coordinate Geometry',
          'Sequences and Series',
          'Trigonometry',
          'Exponentials and Logarithms',
          'Differentiation',
          'Integration',
          'Vectors',
          'Sampling',
          'Data Presentation and Interpretation',
          'Probability',
          'Statistical Distributions',
          'Hypothesis Testing',
          'Quantities and Units in Mechanics',
          'Kinematics',
          'Forces and Newton\'s Laws',
        ]
      },
      a2: {
        name: 'A Level (7357)',
        papers: ['Paper 1: Pure', 'Paper 2: Pure and Mechanics', 'Paper 3: Pure and Statistics'],
        topics: [
          'Proof',
          'Algebra and Functions',
          'Coordinate Geometry',
          'Sequences and Series',
          'Trigonometry',
          'Exponentials and Logarithms',
          'Differentiation',
          'Integration',
          'Numerical Methods',
          'Vectors',
          'Sampling',
          'Data Presentation and Interpretation',
          'Probability',
          'Statistical Distributions',
          'Hypothesis Testing',
          'Quantities and Units in Mechanics',
          'Kinematics',
          'Forces and Newton\'s Laws',
          'Moments',
        ]
      }
    }
  },
  {
    id: 'further-maths',
    name: 'Further Mathematics',
    examBoard: 'AQA',
    specCode: '7366/7367',
    icon: '🧮',
    color: '#8b5cf6',
    description: 'AQA A-Level Further Mathematics',
    levels: {
      as: {
        name: 'AS Level (7366)',
        papers: ['Paper 1: Compulsory', 'Paper 2: Optional'],
        topics: [
          'Complex Numbers',
          'Matrices',
          'Further Algebra and Functions',
          'Further Calculus',
          'Further Vectors',
          'Polar Coordinates',
          'Hyperbolic Functions',
          'Differential Equations',
        ]
      },
      a2: {
        name: 'A Level (7367)',
        papers: ['Paper 1: Compulsory', 'Paper 2: Optional'],
        topics: [
          'Complex Numbers',
          'Further Algebra',
          'Further Calculus',
          'Further Differential Equations',
          'Further Vectors',
          'Polar Coordinates',
          'Hyperbolic Functions',
          'Matrices',
          'Further Series',
          'Number Theory',
          'Groups',
          'Further Mechanics',
          'Decision Mathematics',
          'Discrete Mathematics',
        ]
      }
    }
  },
  {
    id: 'physics',
    name: 'Physics',
    examBoard: 'OCR',
    specCode: 'H156/H556',
    icon: '⚛️',
    color: '#f59e0b',
    description: 'OCR A-Level Physics A',
    levels: {
      as: {
        name: 'AS Level (H156)',
        papers: ['Paper 1: Breadth in Physics', 'Paper 2: Depth in Physics'],
        topics: [
          'Practical Skills in Physics',
          'Foundations of Physics',
          'Forces and Motion',
          'Electrons, Waves and Photons',
        ]
      },
      a2: {
        name: 'A Level (H556)',
        papers: ['Paper 1: Modelling Physics', 'Paper 2: Exploring Physics', 'Paper 3: Unified Physics'],
        topics: [
          'Practical Skills in Physics',
          'Foundations of Physics',
          'Forces and Motion',
          'Electrons, Waves and Photons',
          'Newtonian World and Astrophysics',
          'Particles and Medical Physics',
        ]
      }
    }
  }
];

export const getSubject = (id) => subjects.find(s => s.id === id);
