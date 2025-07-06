# Pandas Fluent API Guide

Examples of pandas method chaining (fluent API) for common data operations.

## Setup

```python
import pandas as pd
import numpy as np

# Sample data
df = pd.DataFrame({
    'name': ['Alice', 'Bob', 'Charlie', 'David', 'Eve'],
    'age': [25, 30, 35, 28, 32],
    'city': ['NYC', 'LA', 'Chicago', 'NYC', 'LA'],
    'salary': [50000, 60000, 70000, 55000, 65000],
    'department': ['Engineering', 'Marketing', 'Engineering', 'HR', 'Marketing']
})
```

## Basic Operations

### 1. Filtering Data

#### Method 1: Using `.query()` (String-based)
```python
# Filter by single condition
result = (df
    .query('age > 30')
    .reset_index(drop=True)
)

# Filter by multiple conditions
result = (df
    .query('age > 25 and salary > 55000')
    .reset_index(drop=True)
)

# Filter using string methods
result = (df
    .query('city.str.contains("NYC|LA")', engine='python')
    .sort_values('age')
    .reset_index(drop=True)
)
```

#### Method 2: Using `.pipe()` with Boolean Indexing (Programmatic - Like Polars/PySpark)
```python
# Filter by single condition
result = (df
    .pipe(lambda x: x[x['age'] > 30])
    .reset_index(drop=True)
)

# Filter by multiple conditions with & (and) | (or)
result = (df
    .pipe(lambda x: x[(x['age'] > 25) & (x['salary'] > 55000)])
    .reset_index(drop=True)
)

# Filter with complex conditions
result = (df
    .pipe(lambda x: x[
        (x['age'] > 25) & 
        (x['salary'] > 55000) & 
        (x['department'].isin(['Engineering', 'Marketing']))
    ])
    .reset_index(drop=True)
)

# Filter with string methods (programmatic)
result = (df
    .pipe(lambda x: x[x['city'].str.contains('NYC|LA')])
    .sort_values('age')
    .reset_index(drop=True)
)

# Filter with isin() (programmatic)
cities_of_interest = ['NYC', 'LA']
result = (df
    .pipe(lambda x: x[x['city'].isin(cities_of_interest)])
    .sort_values('salary', ascending=False)
    .reset_index(drop=True)
)

# Filter with custom conditions
min_salary = 55000
target_departments = ['Engineering', 'HR']
result = (df
    .pipe(lambda x: x[
        (x['salary'] >= min_salary) & 
        (x['department'].isin(target_departments))
    ])
    .reset_index(drop=True)
)
```

#### Method 3: Using `.loc[]` in `.pipe()` (Most Explicit)
```python
# Filter with .loc for more explicit indexing
result = (df
    .pipe(lambda x: x.loc[
        (x['age'] > 30) & (x['salary'] > 60000),
        ['name', 'age', 'salary', 'department']
    ])
    .reset_index(drop=True)
)

# Filter and select specific columns
result = (df
    .pipe(lambda x: x.loc[x['department'] == 'Engineering'])
    .pipe(lambda x: x[['name', 'age', 'salary']])
    .sort_values('salary', ascending=False)
    .reset_index(drop=True)
)
```

#### Method 4: Custom Filter Functions (Reusable)
```python
def filter_by_age(df, min_age=None, max_age=None):
    mask = pd.Series(True, index=df.index)
    if min_age is not None:
        mask &= df['age'] >= min_age
    if max_age is not None:
        mask &= df['age'] <= max_age
    return df[mask]

def filter_by_salary_range(df, min_salary=None, max_salary=None):
    mask = pd.Series(True, index=df.index)
    if min_salary is not None:
        mask &= df['salary'] >= min_salary
    if max_salary is not None:
        mask &= df['salary'] <= max_salary
    return df[mask]

def filter_by_departments(df, departments):
    return df[df['department'].isin(departments)]

# Chain custom filters
result = (df
    .pipe(filter_by_age, min_age=25, max_age=35)
    .pipe(filter_by_salary_range, min_salary=55000)
    .pipe(filter_by_departments, ['Engineering', 'Marketing'])
    .sort_values('salary', ascending=False)
    .reset_index(drop=True)
)
```

#### Method 5: Using `.where()` (Similar to SQL/Spark)
```python
# Filter with .where() - keeps index, fills non-matching with NaN
result = (df
    .where(df['age'] > 30)
    .dropna()
    .reset_index(drop=True)
)

# Multiple conditions with .where()
result = (df
    .where((df['age'] > 25) & (df['salary'] > 55000))
    .dropna()
    .reset_index(drop=True)
)
```

#### Method 6: Direct `.loc[]` Chaining
```python
# Chain .loc[] directly (works but less readable with complex conditions)
result = (df
    .loc[df['age'] > 30]
    .loc[df['salary'] > 55000]
    .sort_values('salary', ascending=False)
    .reset_index(drop=True)
)

# Single .loc[] with complex condition
result = (df
    .loc[(df['age'] > 25) & (df['salary'] > 55000)]
    .sort_values('salary', ascending=False)
    .reset_index(drop=True)
)

# .loc[] with column selection
result = (df
    .loc[df['department'] == 'Engineering', ['name', 'age', 'salary']]
    .sort_values('salary', ascending=False)
    .reset_index(drop=True)
)
```

#### Comparison: Query vs Programmatic vs Direct
```python
# Query method (string-based)
result_query = (df
    .query('age > @min_age and department in @target_depts')
    .reset_index(drop=True)
)

# Programmatic method (more like Polars/PySpark)
min_age = 25
target_depts = ['Engineering', 'Marketing']
result_prog = (df
    .pipe(lambda x: x[
        (x['age'] > min_age) & 
        (x['department'].isin(target_depts))
    ])
    .reset_index(drop=True)
)

# Direct .loc[] method
result_direct = (df
    .loc[(df['age'] > min_age) & (df['department'].isin(target_depts))]
    .reset_index(drop=True)
)
```

### 2. Adding New Columns

```python
# Add single column
result = (df
    .assign(age_group=lambda x: np.where(x['age'] > 30, 'Senior', 'Junior'))
    .sort_values('age')
)

# Add multiple columns
result = (df
    .assign(
        age_group=lambda x: np.where(x['age'] > 30, 'Senior', 'Junior'),
        salary_k=lambda x: x['salary'] / 1000,
        is_high_earner=lambda x: x['salary'] > 60000
    )
)

# Add column based on conditions
result = (df
    .assign(
        performance_bonus=lambda x: np.select(
            [x['salary'] > 65000, x['salary'] > 55000],
            [x['salary'] * 0.1, x['salary'] * 0.05],
            default=0
        )
    )
    .assign(total_comp=lambda x: x['salary'] + x['performance_bonus'])
)
```

### 3. Data Transformation

```python
# Rename columns and transform data
result = (df
    .rename(columns={'name': 'employee_name', 'age': 'employee_age'})
    .assign(
        salary_category=lambda x: pd.cut(
            x['salary'], 
            bins=[0, 55000, 65000, 100000],
            labels=['Low', 'Medium', 'High']
        )
    )
    .sort_values('salary')
)

# String transformations
result = (df
    .assign(
        name_upper=lambda x: x['name'].str.upper(),
        name_length=lambda x: x['name'].str.len(),
        city_code=lambda x: x['city'].str[:2]
    )
)

# Date transformations (if you have date columns)
df_with_dates = df.assign(hire_date=pd.date_range('2020-01-01', periods=len(df)))
result = (df_with_dates
    .assign(
        hire_year=lambda x: x['hire_date'].dt.year,
        hire_month=lambda x: x['hire_date'].dt.month,
        days_since_hire=lambda x: (pd.Timestamp.now() - x['hire_date']).dt.days
    )
)
```

### 4. Grouping and Aggregation

```python
# Group by single column
result = (df
    .groupby('department')
    .agg({
        'salary': ['mean', 'median', 'count'],
        'age': 'mean'
    })
    .round(2)
    .reset_index()
)

# Group by multiple columns with custom aggregation
result = (df
    .groupby(['department', 'city'])
    .agg({
        'salary': 'mean',
        'age': 'median',
        'name': 'count'
    })
    .rename(columns={'name': 'employee_count'})
    .reset_index()
    .sort_values('salary', ascending=False)
)

# Group with transform (add group statistics back to original data)
result = (df
    .assign(
        dept_avg_salary=lambda x: x.groupby('department')['salary'].transform('mean'),
        dept_max_age=lambda x: x.groupby('department')['age'].transform('max')
    )
    .assign(
        salary_vs_dept_avg=lambda x: x['salary'] - x['dept_avg_salary'],
        is_oldest_in_dept=lambda x: x['age'] == x['dept_max_age']
    )
)
```

### 5. Handling Missing Data

```python
# Add some missing data for demonstration
df_with_na = df.copy()
df_with_na.loc[1, 'salary'] = np.nan
df_with_na.loc[3, 'age'] = np.nan

# Handle missing values
result = (df_with_na
    .assign(
        salary_filled=lambda x: x['salary'].fillna(x['salary'].median()),
        age_filled=lambda x: x['age'].fillna(x['age'].mean())
    )
    .dropna(subset=['name'])  # Drop if name is missing
)

# Forward fill and backward fill
result = (df_with_na
    .sort_values('age')
    .assign(
        salary_ffill=lambda x: x['salary'].fillna(method='ffill'),
        salary_bfill=lambda x: x['salary'].fillna(method='bfill')
    )
)
```

### 6. Advanced Chaining Patterns

```python
# Complex data pipeline
result = (df
    .query('age > 25')
    .assign(
        # Calculate percentiles
        salary_percentile=lambda x: x['salary'].rank(pct=True),
        # Create categories
        exp_level=lambda x: pd.cut(x['age'], 
                                 bins=[0, 30, 35, 100], 
                                 labels=['Junior', 'Mid', 'Senior']),
        # Calculate department statistics
        dept_avg_salary=lambda x: x.groupby('department')['salary'].transform('mean')
    )
    .assign(
        # Use previously created columns
        salary_vs_dept=lambda x: (x['salary'] - x['dept_avg_salary']) / x['dept_avg_salary'],
        is_top_performer=lambda x: x['salary_percentile'] > 0.8
    )
    .sort_values(['department', 'salary'], ascending=[True, False])
    .reset_index(drop=True)
)

# Pipeline with custom functions
def categorize_salary(salary):
    if salary > 65000:
        return 'High'
    elif salary > 55000:
        return 'Medium'
    else:
        return 'Low'

def add_bonus(row):
    if row['department'] == 'Engineering':
        return row['salary'] * 0.1
    else:
        return row['salary'] * 0.05

result = (df
    .assign(salary_category=lambda x: x['salary'].apply(categorize_salary))
    .assign(bonus=lambda x: x.apply(add_bonus, axis=1))
    .assign(total_compensation=lambda x: x['salary'] + x['bonus'])
    .pipe(lambda x: x[x['total_compensation'] > 60000])
    .sort_values('total_compensation', ascending=False)
)
```

### 7. Using `.pipe()` for Custom Functions

```python
def add_department_stats(df):
    return df.assign(
        dept_size=df.groupby('department')['name'].transform('count'),
        dept_avg_age=df.groupby('department')['age'].transform('mean'),
        dept_total_salary=df.groupby('department')['salary'].transform('sum')
    )

def classify_employees(df):
    return df.assign(
        classification=lambda x: np.select(
            [
                (x['age'] > 30) & (x['salary'] > 60000),
                (x['age'] > 30) & (x['salary'] <= 60000),
                (x['age'] <= 30) & (x['salary'] > 60000),
            ],
            ['Senior High-Earner', 'Senior', 'Junior High-Earner'],
            default='Junior'
        )
    )

# Chain with custom functions
result = (df
    .pipe(add_department_stats)
    .pipe(classify_employees)
    .assign(
        dept_salary_share=lambda x: x['salary'] / x['dept_total_salary'],
        is_dept_veteran=lambda x: x['age'] > x['dept_avg_age']
    )
    .sort_values(['department', 'salary'], ascending=[True, False])
)
```

### 8. Text Processing Chain

```python
# Sample text data
text_df = pd.DataFrame({
    'text': ['Hello World', 'PYTHON pandas', 'Data Science!', 'machine learning'],
    'category': ['A', 'B', 'A', 'B']
})

result = (text_df
    .assign(
        # Basic text cleaning
        text_clean=lambda x: x['text'].str.lower().str.strip(),
        # Extract features
        word_count=lambda x: x['text'].str.count(r'\w+'),
        char_count=lambda x: x['text'].str.len(),
        # Create flags
        has_exclamation=lambda x: x['text'].str.contains('!'),
        starts_with_vowel=lambda x: x['text'].str.lower().str.startswith(('a', 'e', 'i', 'o', 'u'))
    )
    .assign(
        # Use previously created columns
        text_density=lambda x: x['word_count'] / x['char_count'],
        is_technical=lambda x: x['text_clean'].str.contains('python|data|machine')
    )
    .sort_values('text_density', ascending=False)
)
```

## Best Practices

1. **Use parentheses** for multi-line chaining
2. **Keep lambda functions simple** - use `.pipe()` for complex operations
3. **Break long chains** into logical sections
4. **Use descriptive variable names** in lambda functions
5. **Test each step** by breaking the chain temporarily
6. **Consider performance** - some operations might be faster with traditional syntax

## Common Pitfalls

1. **Avoid modifying original DataFrame** - chaining creates copies
2. **Be careful with column references** in lambda functions
3. **Watch out for SettingWithCopyWarning** - use `.copy()` when needed
4. **Don't chain operations that return different types** (e.g., `.describe()`)

## Performance Tips

```python
# Good: Single assign with multiple columns
result = df.assign(
    col1=lambda x: x['age'] * 2,
    col2=lambda x: x['salary'] / 1000,
    col3=lambda x: x['name'].str.upper()
)

# Less efficient: Multiple assigns
result = (df
    .assign(col1=lambda x: x['age'] * 2)
    .assign(col2=lambda x: x['salary'] / 1000)
    .assign(col3=lambda x: x['name'].str.upper())
)
```